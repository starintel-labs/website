import { renderWordmark } from "@starintel/design/wordmark";
import "@starintel/design/css/tokens.css";
import "@starintel/design/css/base.css";
import "@starintel/design/css/layout.css";
import "@starintel/design/css/components.css";
import "./radar.css";
import { documentDate, documentReader, element } from "./document-view.ts";
import type { DocumentFrame, PublicDocument } from "../shared/public-document.ts";
import { isPublicDocument } from "../shared/public-document.ts";

for (const [selector, compact] of [["[data-wordmark]", true], ["[data-wordmark-sm]", true]] as const) {
  document.querySelector(selector)?.replaceChildren(renderWordmark({ size: "sm", compact }));
}

const scope = document.getElementById("radar-scope") as HTMLSelectElement;
const search = document.getElementById("radar-search") as HTMLInputElement;
const type = document.getElementById("radar-type") as HTMLSelectElement;
const pause = document.getElementById("radar-pause") as HTMLButtonElement;
const refresh = document.getElementById("radar-refresh") as HTMLButtonElement;
const status = document.getElementById("radar-status")!;
const feed = document.getElementById("document-feed")!;
const reader = document.getElementById("radar-reader")!;
const empty = document.getElementById("radar-empty")!;
const results = document.getElementById("radar-results")!;
const note = document.getElementById("radar-snapshot-note")!;
const documents = new Map<string, PublicDocument>();
const rows = new Map<string, HTMLLIElement>();
let selected = new URLSearchParams(location.hash.slice(1)).get("document") ?? undefined;
let renderedDocument: PublicDocument | undefined;
let paused = false;
let pausedWindow: PublicDocument[] = [];
let incoming = 0;
let revision = 0;
let stream: EventSource;
let snapshot: AbortController | undefined;
let snapshotChanges: Set<string> | undefined;
let scheduled = false;

function setStatus(state: string, label: string): void {
  if (status.dataset.state === state && status.textContent === label) return;
  status.dataset.state = state;
  status.textContent = label;
}

function resetReader(): void {
  const placeholder = element("div", "radar-empty");
  placeholder.append(element("span", "radar-eyebrow", "DOCUMENT READER"), element("h2", "", "Follow a record, not a dot."), element("p", "", "Select a public document from the feed to read it here."));
  reader.replaceChildren(placeholder);
  renderedDocument = undefined;
}

function showReader(collection: PublicDocument[]): void {
  if (!selected && collection.length) selected = collection[0]!.id;
  const doc = collection.find((item) => item.id === selected);
  if (doc !== renderedDocument) {
    if (doc) reader.replaceChildren(documentReader(doc));
    else resetReader();
    renderedDocument = doc;
  }
}

function renderDocuments(): void {
  const collection = paused ? pausedWindow : [...documents.values()].reverse();
  const chosenType = type.value;
  const availableTypes = [...new Set([...collection.map((doc) => doc.dtype), ...(chosenType ? [chosenType] : [])])].sort();
  type.replaceChildren(new Option("All types", ""), ...availableTypes.map((dtype) => new Option(dtype, dtype)));
  type.value = chosenType;
  const query = search.value.trim().toLowerCase();
  const visible = collection.filter((doc) => (!chosenType || doc.dtype === chosenType) && (!query || [doc.title, doc.summary, doc.dtype, doc.dataset, doc.id, ...doc.fields.map((field) => field.value)].filter(Boolean).join(" ").toLowerCase().includes(query)));
  let cursor = feed.firstElementChild;
  const visibleIds = new Set(visible.map((doc) => doc.id));
  for (const doc of visible) {
    let row = rows.get(doc.id);
    if (!row) {
      row = element("li", "");
      const button = element("button", "document-row");
      button.type = "button";
      button.setAttribute("aria-controls", "radar-reader");
      button.addEventListener("click", () => {
        selected = doc.id;
        history.replaceState(null, "", `#document=${encodeURIComponent(doc.id)}`);
        showReader(paused ? pausedWindow : [...documents.values()].reverse());
        for (const [id, item] of rows) item.querySelector("button")!.setAttribute("aria-pressed", String(id === selected));
        reader.tabIndex = -1;
        reader.focus({ preventScroll: true });
        if (matchMedia("(max-width: 800px)").matches) reader.scrollIntoView({ block: "start" });
      });
      row.append(button);
      rows.set(doc.id, row);
    }
    const button = row.querySelector("button")!;
    button.setAttribute("aria-pressed", String(doc.id === selected));
    button.replaceChildren(element("span", "document-type", doc.dtype), element("span", "document-row__title", doc.title));
    if (doc.summary) button.append(element("span", "document-row__excerpt", doc.summary.slice(0, 300)));
    button.append(element("span", "document-row__meta", `${doc.dataset} · ${documentDate(doc.updatedAt)}`));
    if (row === cursor) cursor = cursor.nextElementSibling;
    else feed.insertBefore(row, cursor);
  }
  for (const [id, row] of rows) if (!visibleIds.has(id)) { row.remove(); rows.delete(id); }
  empty.hidden = visible.length > 0;
  empty.querySelector("h2")!.textContent = collection.length ? "No records match your filters." : "Waiting for the next record.";
  empty.querySelector("p")!.textContent = collection.length ? "Try a different title, collection, or document type." : "Public documents will appear as they arrive. Network events without a readable document still count above.";
  results.textContent = `${visible.length} public records${paused ? " · paused" : " · latest 100 retained"}`;
  document.getElementById("radar-document-count")!.textContent = scope.value === "public" ? String(collection.length) : "—";
  pause.textContent = paused ? `Resume feed${incoming ? ` (${incoming} updates)` : ""}` : "Pause feed";
  pause.setAttribute("aria-pressed", String(paused));
  showReader(collection);
  for (const [id, row] of rows) row.querySelector("button")!.setAttribute("aria-pressed", String(id === selected));
}

function scheduleRender(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; renderDocuments(); });
}

function receive(frame: DocumentFrame): void {
  if (!Array.isArray(frame.documents) || !frame.documents.every(isPublicDocument) || !Array.isArray(frame.removed) || !frame.removed.every((id) => typeof id === "string")) return;
  revision++;
  for (const id of frame.removed) {
    snapshotChanges?.add(id);
    documents.delete(id);
    pausedWindow = pausedWindow.filter((doc) => doc.id !== id);
    if (selected === id) selected = undefined;
  }
  for (const doc of [...frame.documents].reverse()) {
    snapshotChanges?.add(doc.id);
    documents.delete(doc.id);
    documents.set(doc.id, doc);
    while (documents.size > 100) documents.delete(documents.keys().next().value!);
  }
  if (paused) incoming += frame.documents.length;
  scheduleRender();
}

async function loadSnapshot(): Promise<void> {
  snapshot?.abort();
  const controller = new AbortController();
  snapshot = controller;
  const generation = revision;
  const changes = new Set<string>();
  snapshotChanges = changes;
  refresh.disabled = true;
  note.textContent = "Loading corpus snapshot…";
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("/api/recent-documents?sample=100", { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("snapshot unavailable");
    const body = await response.json();
    if (!Array.isArray(body.documents) || !body.documents.every(isPublicDocument)) throw new Error("invalid public snapshot");
    if (snapshot !== controller || scope.value !== "public") return;
    const live = generation === revision ? [] : [...documents.values()].filter((doc) => changes.has(doc.id));
    documents.clear();
    for (const doc of [...body.documents].reverse() as PublicDocument[]) if (!changes.has(doc.id)) documents.set(doc.id, doc);
    for (const doc of live) { documents.delete(doc.id); documents.set(doc.id, doc); }
    while (documents.size > 100) documents.delete(documents.keys().next().value!);
    if (paused) pausedWindow = pausedWindow.filter((doc) => documents.has(doc.id));
    scheduleRender();
    note.textContent = body.stale ? "Cached snapshot · source temporarily unavailable" : "Public corpus connected";
  } catch {
    if (snapshot === controller && scope.value === "public") note.textContent = "Snapshot unavailable. Live documents will still appear. Retry with Refresh snapshot.";
  } finally {
    clearTimeout(timeout);
    if (snapshot === controller) { refresh.disabled = false; snapshotChanges = undefined; }
  }
}

function connect(): void {
  stream?.close();
  const source = new EventSource(`/radar/stream?scope=${encodeURIComponent(scope.value)}`);
  stream = source;
  source.onopen = () => { if (stream === source) setStatus("live", "live"); };
  source.onerror = () => { if (stream === source) setStatus("reconnecting", "reconnecting"); };
  source.addEventListener("status", (event) => {
    if (stream !== source) return;
    try {
      const { state } = JSON.parse((event as MessageEvent).data);
      const labels: Record<string, string> = { off: "standby", connecting: "connecting upstream", live: "live", down: "upstream reconnecting" };
      if (Object.hasOwn(labels, state)) setStatus(state, labels[state]!);
    } catch { /* Invalid status frames do not affect the connection state. */ }
  });
  source.addEventListener("documents", (event) => {
    if (stream !== source || scope.value !== "public") return;
    try {
      const frame = JSON.parse((event as MessageEvent).data) as DocumentFrame;
      if (Array.isArray(frame.documents) && Array.isArray(frame.removed)) receive(frame);
    } catch { /* A malformed frame must not replace the current window. */ }
  });
  source.onmessage = (event) => {
    if (stream !== source) return;
    let frame;
    try { frame = JSON.parse(event.data); } catch { return; }
    if (frame.type !== "rate") return;
    document.getElementById("radar-rate")!.textContent = frame.rps.toFixed(1);
    document.getElementById("radar-total")!.textContent = `${frame.total.toLocaleString("en-US")} events observed`;
    const maximum = Math.max(1, ...Object.values(frame.families as Record<string, number>));
    document.getElementById("radar-families")!.replaceChildren(...Object.entries(frame.families as Record<string, number>).map(([name, count]) => {
      const row = element("div", "radar-family-row");
      const bar = element("div", "radar-family-bar");
      bar.style.width = `${count / maximum * 100}%`;
      row.append(element("span", "", name), bar, element("span", "", count.toLocaleString("en-US")));
      return row;
    }));
    const labels: Record<string, string> = { s: "<2 KB", m: "2–64 KB", l: "64 KB–1 MB", xl: ">1 MB" };
    document.getElementById("radar-sizes")!.replaceChildren(...Object.entries(frame.sizes as Record<string, number>).map(([size, count]) => element("span", "", `${labels[size] ?? size}: ${count.toLocaleString("en-US")}`)));
  };
}

pause.addEventListener("click", () => {
  paused = !paused;
  pausedWindow = paused ? [...documents.values()].reverse() : [];
  incoming = 0;
  renderDocuments();
});
search.addEventListener("input", renderDocuments);
type.addEventListener("change", renderDocuments);
refresh.addEventListener("click", () => { void loadSnapshot(); });
scope.addEventListener("change", () => {
  snapshot?.abort();
  revision++;
  documents.clear(); rows.clear(); feed.replaceChildren();
  selected = undefined; paused = false; pausedWindow = []; incoming = 0;
  resetReader();
  document.getElementById("radar-public")!.hidden = scope.value !== "public";
  document.getElementById("radar-aggregate")!.hidden = scope.value !== "aggregate";
  document.getElementById("radar-rate")!.textContent = "—";
  document.getElementById("radar-total")!.textContent = "0 events observed";
  document.getElementById("radar-families")!.replaceChildren();
  document.getElementById("radar-sizes")!.replaceChildren();
  setStatus("connecting", "connecting");
  renderDocuments(); connect();
  if (scope.value === "public") void loadSnapshot();
});

renderDocuments();
connect();
void loadSnapshot();
