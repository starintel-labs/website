import { renderWordmark } from "@starintel/design/wordmark";
import { documentCard } from "./document-view.ts";
import type { PublicDocument } from "../shared/public-document.ts";
import { isPublicDocument } from "../shared/public-document.ts";
import "@starintel/design/css/tokens.css";
import "@starintel/design/css/base.css";
import "@starintel/design/css/layout.css";
import "@starintel/design/css/components.css";
import "@starintel/design/css/motion.css";

import "./home.css";
import { initFeatureSlider } from "./feature-slider.js";

const slider = document.querySelector<HTMLElement>(".si-feature-slider");
if (slider) initFeatureSlider(slider);

const brand = document.querySelector<HTMLElement>("[data-wordmark]");
if (brand) brand.replaceChildren(renderWordmark({ size: "sm", compact: true }));
const hero = document.querySelector<HTMLElement>("[data-wordmark-lg]");
if (hero) hero.replaceChildren(renderWordmark({ size: "lg" }));
const foot = document.querySelector<HTMLElement>("[data-wordmark-sm]");
if (foot) foot.replaceChildren(renderWordmark({ size: "sm", compact: true }));

const path = location.pathname;
for (const a of document.querySelectorAll<HTMLAnchorElement>(
  ".si-topbar__nav a",
)) {
  const target = a.dataset.active;
  if (target === "radar" && path.startsWith("/radar"))
    a.setAttribute("aria-current", "page");
  else if (target === "home" && (path === "/" || path === ""))
    a.setAttribute("aria-current", "page");
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

let snapshotRequest: AbortController | undefined;
async function loadRecent(): Promise<void> {
  const grid = document.getElementById("recent-docs");
  const note = document.getElementById("recent-note");
  if (!grid) return;
  snapshotRequest?.abort();
  const controller = new AbortController();
  snapshotRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 12_000);
  if (note) note.textContent = "Loading the public corpus…";
  try {
    const res = await fetch("/api/recent-documents?sample=12", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      documents: PublicDocument[];
      window: number;
      stale?: boolean;
    };
    if (!Array.isArray(body.documents) || !body.documents.every(isPublicDocument)) throw new Error("invalid public snapshot");
    if (snapshotRequest !== controller) return;
    grid.replaceChildren();
    if (body.documents.length === 0) {
      grid.append(
        emptyCard(
          "No public records in this recent window",
          "Read the live public document feed on Radar, or check this snapshot again shortly.",
        ),
      );
      if (note) note.textContent = "Public snapshot connected · no matching recent records";
      return;
    }
    if (note)
      note.textContent = `${body.documents.length} public records · ${body.window} in this window${body.stale ? " · cached while the source reconnects" : ""}`;
    for (const doc of body.documents) {
      grid.append(documentCard(doc));
    }
  } catch {
    if (snapshotRequest !== controller) return;
    if (note) note.textContent = "Snapshot source temporarily unavailable · live activity may still be available on Radar";
    const empty = emptyCard("Snapshot temporarily unavailable", "The public source did not respond in time. Retry the snapshot, or read incoming records on Radar.");
    const retry = document.createElement("button");
    retry.className = "snapshot-retry";
    retry.type = "button";
    retry.textContent = "Retry snapshot";
    retry.addEventListener("click", () => { void loadRecent(); });
    empty.append(retry);
    if (!grid.querySelector(".public-document-card")) grid.replaceChildren(empty);
  } finally {
    clearTimeout(timeout);
  }
}

void loadRecent();
