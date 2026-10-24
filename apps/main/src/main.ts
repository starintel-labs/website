/**
 * starintel.actor landing page behavior.
 * Progressive enhancement: the page is complete without JS; this module adds
 * the wordmark, active nav state, and the recent-documents discovery feed.
 */
import { renderWordmark } from "@starintel/design/wordmark";
import { card } from "@starintel/design/components";
import "@starintel/design/css/tokens.css";
import "@starintel/design/css/base.css";
import "@starintel/design/css/layout.css";
import "@starintel/design/css/components.css";
import "@starintel/design/css/motion.css";

const brand = document.querySelector<HTMLElement>("[data-wordmark]");
if (brand) brand.replaceChildren(renderWordmark({ size: "sm", compact: true }));
const hero = document.querySelector<HTMLElement>("[data-wordmark-lg]");
if (hero) hero.replaceChildren(renderWordmark({ size: "lg" }));
const foot = document.querySelector<HTMLElement>("[data-wordmark-sm]");
if (foot) foot.replaceChildren(renderWordmark({ size: "sm", compact: true }));

const path = location.pathname;
for (const a of document.querySelectorAll<HTMLAnchorElement>(".si-topbar__nav a")) {
  const target = a.dataset.active;
  if (target === "radar" && path.startsWith("/radar")) a.setAttribute("aria-current", "page");
  else if (target === "home" && (path === "/" || path === "")) a.setAttribute("aria-current", "page");
}

interface PublicDoc {
  _id: string;
  dtype: string;
  title?: string;
  summary?: string;
  description?: string;
  dataset: string;
  date_updated: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

function shortId(id: string): string {
  const tail = id.split(":").slice(2).join(":");
  return tail.length > 0 ? tail : id;
}

function emptyCard(title: string, desc: string): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "si-empty";
  const mark = document.createElement("span");
  mark.className = "si-empty__mark";
  mark.textContent = "(λ)";
  const t = document.createElement("span");
  t.className = "si-empty__title";
  t.textContent = title;
  const d = document.createElement("span");
  d.style.fontSize = "0.85rem";
  d.textContent = desc;
  empty.append(mark, t, d);
  return empty;
}

async function loadRecent(): Promise<void> {
  const grid = document.getElementById("recent-docs");
  const note = document.getElementById("recent-note");
  if (!grid) return;
  try {
    const res = await fetch("/api/recent-documents?sample=12", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { documents: PublicDoc[]; window: number };
    grid.replaceChildren();
    if (body.documents.length === 0) {
      grid.append(
        emptyCard(
          "No public documents published yet",
          "The public-safe projection is empty right now. Documents appear here when the operator marks batches public.",
        ),
      );
      return;
    }
    if (note) note.textContent = `sampled from newest ${body.window} public documents`;
    for (const doc of body.documents) {
      grid.append(
        card({
          dtype: doc.dtype,
          title: doc.title ?? shortId(doc._id),
          desc: doc.summary ?? doc.description,
          meta: [doc.dataset, fmtDate(doc.date_updated), shortId(doc._id)],
        }),
      );
    }
  } catch {
    grid.replaceChildren(
      emptyCard(
        "Corpus snapshot unavailable",
        "The public projection service is not reachable right now. This section recovers automatically on the next visit — no fabricated data is shown in the meantime.",
      ),
    );
  }
}

void loadRecent();
