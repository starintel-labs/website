/**
 * blog.starintel.actor static builder.
 * Consumes content/blog (published by scripts/publish.mjs), renders the
 * shared StarIntel design system, emits dist/ ready for static hosting.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalize,
  readManifest,
  readDocHtml,
  renderOrgArticle,
  renderPage,
  renderRss,
  renderSitemap,
  filetagsToTags,
  articleJsonLd,
} from "@starintel/content";

const here = dirname(fileURLToPath(import.meta.url));
const websiteRoot = join(here, "..", "..");
const contentDir = join(websiteRoot, "content", "blog");
const dist = join(here, "dist");
const BASE = "https://blog.starintel.actor";

const manifest = readManifest(contentDir);
const docs = normalize(manifest);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Shared CSS from the design system.
cpSync(join(websiteRoot, "packages", "ui", "css"), join(dist, "css"), { recursive: true });

const NAV = [
  { href: "/", label: "Blog", current: true },
  { href: "https://starintel.actor/research/", label: "Research" },
  { href: "https://starintel.actor/radar", label: "Radar" },
  { href: "https://starintel.actor/", label: "starintel.actor", external: true },
];

// Article pages.
for (const doc of docs) {
  const html = readDocHtml(contentDir, doc.slug);
  const tags = filetagsToTags(doc.filetags, doc.tags);
  const article = renderOrgArticle({ doc, html, tagList: tags });
  const page = renderPage({
    title: `${doc.title} — StarIntel Blog`,
    description: doc.description || doc.excerpt.slice(0, 150),
    canonical: `${BASE}/${doc.slug}/`,
    baseUrl: BASE,
    nav: NAV,
    contentHtml: article.html,
    jsonLd: articleJsonLd({
      headline: doc.title,
      description: doc.description || doc.excerpt.slice(0, 150),
      url: `${BASE}/${doc.slug}/`,
      datePublished: doc.isoDate,
      author: doc.author ?? "nsaspy",
      keywords: tags,
    }),
    feedHref: "/feed.xml",
  });
  const dir = join(dist, doc.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), page);
}

// Index: reverse chronological feed of cards.
const cards = docs
  .map(
    (d) => `      <a class="si-card" href="/${d.slug}/">
        <span class="si-card__dtype">${d.isoDate ?? "undated"}</span>
        <span class="si-card__title">${escapeHtml(d.title)}</span>
        <span class="si-card__desc">${escapeHtml(d.description || d.excerpt)}</span>
        <span class="si-card__meta">${filetagsToTags(d.filetags, d.tags).slice(0, 5).map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</span>
      </a>`,
  )
  .join("\n");
const index = renderPage({
  title: "StarIntel Blog",
  description: "Longform technical writing on StarIntel: symbolic AI, actors, Prolog, and structured intelligence.",
  canonical: `${BASE}/`,
  baseUrl: BASE,
  nav: NAV,
  contentHtml: `  <section class="si-hero" style="padding-top:2.5rem">
    <p class="si-hero__kicker">Symbolic AI · Engineering notes</p>
    <h1 class="si-hero__title" style="font-size:2rem">StarIntel Blog</h1>
    <p class="si-hero__lede">Longform technical writing on StarIntel: expert systems, actor orchestration, Prolog verification, and structured intelligence. Authored in Org, exported deterministically, published with provenance.</p>
  </section>
  <section class="si-grid" style="margin-top:2rem">
${cards || '      <div class="si-card"><span class="si-card__title">No posts yet</span></div>'}
  </section>`,
  feedHref: "/feed.xml",
});
writeFileSync(join(dist, "index.html"), index);

// RSS + sitemap.
writeFileSync(
  join(dist, "feed.xml"),
  renderRss({
    title: "StarIntel Blog",
    description: "Longform technical writing on StarIntel.",
    baseUrl: BASE,
    path: "/",
    docs: docs.map((d) => ({
      slug: d.slug,
      title: d.title,
      isoDate: d.isoDate,
      excerpt: d.description || d.excerpt,
      url: `${BASE}/${d.slug}/`,
    })),
  }),
);
writeFileSync(
  join(dist, "sitemap.xml"),
  renderSitemap([
    { loc: `${BASE}/`, lastmod: manifest.generated_at },
    ...docs.map((d) => ({ loc: `${BASE}/${d.slug}/`, lastmod: d.isoDate })),
  ]),
);

writeFileSync(
  join(dist, "404.html"),
  renderPage({
    title: "Not found — StarIntel Blog",
    description: "Page not found.",
    canonical: `${BASE}/404.html`,
    baseUrl: BASE,
    nav: NAV,
    robots: "noindex",
    contentHtml: '  <div class="si-panel"><h1 class="si-section__title">404</h1><p class="muted">No such page. <a href="/">Back to the blog</a>.</p></div>',
  }),
);

console.log(`blog: built ${docs.length} post(s) -> dist/`);

function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
