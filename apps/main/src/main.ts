/**
 * starintel.actor landing page behavior.
 * Progressive enhancement: the page is complete without JS; this module adds
 * the wordmark, active nav state, and the recent-documents discovery feed.
 */
import { renderWordmark } from "@starintel/ui/symbolics";
import { card } from "@starintel/ui/components";
import "@starintel/ui/css/tokens.css";
import "@starintel/ui/css/base.css";
import "@starintel/ui/css/layout.css";

const brand = document.querySelector<HTMLElement>("[data-wordmark]");
if (brand) brand.replaceChildren(renderWordmark({ size: "sm" }));
const hero = document.querySelector<HTMLElement>("[data-wordmark-lg]");
if (hero) hero.replaceChildren(renderWordmark({ size: "lg" }));
const foot = document.querySelector<HTMLElement>("[data-wordmark-sm]");
if (foot) foot.replaceChildren(renderWordmark({ size: "sm" }));

const path = location.pathname;
for (const a of document.querySelectorAll<HTMLAnchorElement>(".si-topbar__nav a")) {
  const target = a.dataset.active;
  if (target === "radar" && path.startsWith("/radar")) a.setAttribute("aria-current", "page");
  else if (!target && (path === "/" || path === "") ) a.setAttribute("aria-current", "page");
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
        card({
          dtype: "corpus",
          title: "No public documents published yet",
          desc: "The public-safe projection is empty right now. Documents appear here when the operator marks batches public.",
        }),
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
      card({
        dtype: "corpus",
        title: "Corpus snapshot unavailable",
        desc: "The public projection service is not reachable right now. This section recovers automatically on the next visit.",
      }),
    );
  }
}

void loadRecent();
