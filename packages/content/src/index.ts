/**
 * Generated-content readers and page rendering for StarIntel web properties.
 * Content arrives as exported HTML fragments + manifest.json produced by
 * scripts/publish.mjs; this module is the only consumer the site builders use.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brandTheme, wordmarkAria } from "@starintel/design/brand";
import { wordmarkHtml } from "@starintel/design/wordmark";
import { metaTags, articleJsonLd, jsonLdScript } from "@starintel/seo";

/** Parse Org timestamp forms like "<2026-08-28 Fri>" or "[2026-08-28 Fri]" or "2026-08-28". */
export function parseOrgDate(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : iso;
}

export interface ContentDoc {
  slug: string;
  title: string;
  date: string | null;
  isoDate: string | null;
  author: string | null;
  description: string;
  excerpt: string;
  tags: string[];
  filetags: string | null;
  id: string | null;
  status: string | null;
  anchors: string[];
  approval: {
    schema: string | null;
    state: string | null;
    actor: string | null;
    evidence: string | null;
    decided_at: string | null;
  } | null;
  source: {
    repo: string | null;
    path: string | null;
    commit: string | null;
    blob: string | null;
    content_sha256: string;
  };
}

export interface Manifest {
  target: string;
  generated_at: string;
  source_commit: string | null;
  count: number;
  documents: ContentDoc[];
}

export function readManifest(contentDir: string): Manifest {
  return JSON.parse(readFileSync(join(contentDir, "manifest.json"), "utf8")) as Manifest;
}

export function readDocHtml(contentDir: string, slug: string): string {
  return readFileSync(join(contentDir, `${slug}.html`), "utf8");
}

/** Normalize manifest docs: parse dates, sort by date desc then title. */
export function normalize(manifest: Manifest): ContentDoc[] {
  const docs = manifest.documents.map((d) => ({ ...d, isoDate: parseOrgDate(d.date) }));
  docs.sort((a, b) => (b.isoDate ?? "").localeCompare(a.isoDate ?? "") || a.title.localeCompare(b.title));
  return docs;
}

/** Parse org filetags ":starintel:prolog:" into tags. */
export function filetagsToTags(ft: string | null, existing: string[]): string[] {
  if (!ft) return existing;
  const parts = ft.split(":").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...existing, ...parts])];
}

export interface PageOptions {
  title: string;
  description: string;
  canonical: string;
  baseUrl: string;
  contentHtml: string;
  /** Brand key selecting the stated wordmark (see @starintel/design/brand). */
  brand?: string;
  /** Extra nav links rendered after the brand. */
  nav?: { href: string; label: string; current?: boolean; external?: boolean }[];
  /** Org body content? Applies org typography. */
  org?: boolean;
  jsonLd?: string | null;
  /** RSS discovery */
  feedHref?: string | null;
  robots?: string | null;
  css?: string[];
}

const CSS_HREFS = [
  "/css/tokens.css",
  "/css/base.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/org.css",
  "/css/motion.css",
];

export function renderPage(o: PageOptions): string {
  const theme = brandTheme(o.brand);
  const nav = (o.nav ?? [])
    .map(
      (l) =>
        `<a href="${l.href}"${l.current ? ' aria-current="page"' : ""}${l.external ? ' target="_blank" rel="noopener"' : ""}>${escapeHtml(l.label)}</a>`,
    )
    .join("\n        ");
  const jsonLd = o.jsonLd ? jsonLdScript(o.jsonLd) : "";
  const feed = o.feedHref ? `<link rel="alternate" type="application/rss+xml" href="${escapeHtml(o.feedHref)}">` : "";
  const robots = o.robots ? `<meta name="robots" content="${escapeHtml(o.robots)}">` : "";
  const css = (o.css ?? CSS_HREFS).map((h) => `<link rel="stylesheet" href="${h}">`).join("\n    ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#090807">
    ${css}
    ${metaTags({
      title: o.title,
      description: o.description,
      canonical: o.canonical,
      type: "article",
      siteName: theme.orgName,
      robots: o.robots ?? undefined,
    })}
    ${feed}
    ${jsonLd}
  </head>
  <body>
    <header class="si-topbar">
      <a class="si-topbar__brand" href="/" aria-label="${escapeHtml(wordmarkAria(theme))}">${wordmarkHtml(o.brand ?? "starintel", "si-wordmark--sm", true)}</a>
      <nav class="si-topbar__nav" aria-label="Primary">
        ${nav}
      </nav>
    </header>
    <main class="si-shell si-section">
${o.contentHtml}
    </main>
    <footer class="si-footer">
      <div class="si-shell">
        <span>${wordmarkHtml(o.brand ?? "starintel", "si-wordmark--sm")} <span class="muted">— ${escapeHtml(theme.tagline)}</span></span>
        <span><a href="https://starintel.actor/">starintel.actor</a></span>
      </div>
    </footer>
  </body>
</html>
`;
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Wrap an org HTML fragment with provenance + TOC chrome. */
export function renderOrgArticle(opts: {
  doc: ContentDoc;
  html: string;
  tagList?: string[];
}): { toc: string | null; html: string } {
  const d = opts.doc;
  const tags = filetagsToTags(d.filetags, opts.tagList ?? d.tags);
  const chips = [
    d.isoDate ? `<span class="si-chip">${d.isoDate}</span>` : "",
    d.author ? `<span class="si-chip si-chip--accent">${escapeHtml(d.author)}</span>` : "",
    ...tags.slice(0, 8).map((t) => `<span class="si-chip">${escapeHtml(t)}</span>`),
  ]
    .filter(Boolean)
    .join("\n      ");
  const anchorList =
    d.anchors.length > 2
      ? `<div class="si-toc"><h2>Contents</h2><ul>${d.anchors
          .map((a) => `<li><a href="#${escapeHtml(a)}">${escapeHtml(a.replaceAll(/-/g, " "))}</a></li>`)
          .join("")}</ul></div>`
      : null;
  const provenance = `<div class="si-panel" style="margin-top:3rem;font-size:0.78rem">
  <strong class="mono" style="font-size:0.72rem;letter-spacing:0.12em;color:var(--si-accent-primary)">PROVENANCE</strong>
  <p class="muted mono" style="margin:0.6rem 0 0;font-size:0.75rem;overflow-wrap:anywhere">
    source ${escapeHtml(d.source.repo ?? "unknown")} · ${escapeHtml(d.source.path ?? "")}<br>
    commit ${escapeHtml((d.source.commit ?? "").slice(0, 12))} · sha256 ${escapeHtml(d.source.content_sha256.slice(0, 16))}…
    ${d.approval?.state ? `<br>approval ${escapeHtml(d.approval.state)} by ${escapeHtml(d.approval.actor ?? "unknown")} on ${escapeHtml(d.approval.decided_at ?? "unknown")}` : ""}
  </p>
</div>`;
  const html = `
  <article class="si-org">
    <p style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1.4rem">
      ${chips}
    </p>
    ${anchorList ?? ""}
    ${opts.html}
    ${provenance}
  </article>`;
  return { toc: anchorList, html };
}

/** RSS 2.0 feed. */
export function renderRss(opts: {
  title: string;
  description: string;
  baseUrl: string;
  path: string;
  docs: { slug: string; title: string; isoDate: string | null; excerpt: string; url: string }[];
}): string {
  const items = opts.docs
    .map(
      (d) => `    <item>
      <title>${escapeHtml(d.title)}</title>
      <link>${escapeHtml(d.url)}</link>
      <guid isPermaLink="true">${escapeHtml(d.url)}</guid>
      <pubDate>${d.isoDate ? new Date(d.isoDate + "T00:00:00Z").toUTCString() : new Date().toUTCString()}</pubDate>
      <description>${escapeHtml(d.excerpt)}</description>
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(opts.title)}</title>
    <link>${escapeHtml(opts.baseUrl + opts.path)}</link>
    <description>${escapeHtml(opts.description)}</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;
}

/** sitemap.xml from url+lastmod pairs. */
export function renderSitemap(urls: { loc: string; lastmod?: string | null }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>
`;
}

export { articleJsonLd };
