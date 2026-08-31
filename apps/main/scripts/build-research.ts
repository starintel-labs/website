/**
 * Generates /research/ pages into public/ from content/research.
 * Runs before `vite build` so the artifacts ship with the main site dist.
 * Research publication is approval-gated upstream by scripts/publish.mjs;
 * this renderer additionally refuses to render docs whose approval state is
 * not APPROVED with evidence (defense in depth).
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalize,
  readManifest,
  readDocHtml,
  renderOrgArticle,
  renderPage,
  renderSitemap,
  filetagsToTags,
  articleJsonLd,
} from "@starintel/content";

const here = dirname(fileURLToPath(import.meta.url));
const websiteRoot = join(here, "..", "..", "..");
const contentDir = join(websiteRoot, "content", "research");
const outRoot = join(here, "..", "public", "research");
const BASE = "https://starintel.actor/research";

const manifest = readManifest(contentDir);
const docs = normalize(manifest);

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
cpSync(join(websiteRoot, "packages", "ui", "css"), join(outRoot, "css"), { recursive: true });

const NAV = [
  { href: "/", label: "Home" },
  { href: "/research/", label: "Research", current: true },
  { href: "/radar", label: "Radar" },
  { href: "https://blog.starintel.actor/", label: "Blog", external: true },
  { href: "https://nsaspy.starintel.actor/", label: "nsaspy", external: true },
];

for (const doc of docs) {
  const approval = doc.approval;
  if (!approval || approval.state !== "APPROVED" || !approval.evidence) {
    throw new Error(`refusing to render ${doc.slug}: approval gate not satisfied`);
  }
  const html = readDocHtml(contentDir, doc.slug);
  const tags = filetagsToTags(doc.filetags, doc.tags);
  const article = renderOrgArticle({ doc, html, tagList: tags });
  const page = renderPage({
    title: `${doc.title} — StarIntel Research`,
    description: doc.description || doc.excerpt.slice(0, 150),
    canonical: `${BASE}/${doc.slug}/`,
    baseUrl: "https://starintel.actor",
    nav: NAV,
    contentHtml: article.html,
    jsonLd: articleJsonLd({
      headline: doc.title,
      description: doc.description || doc.excerpt.slice(0, 150),
      url: `${BASE}/${doc.slug}/`,
      datePublished: doc.isoDate,
      author: approval.actor ?? doc.author ?? "StarIntel Auto Research",
      keywords: tags,
    }),
  });
  mkdirSync(join(outRoot, doc.slug), { recursive: true });
  writeFileSync(join(outRoot, doc.slug, "index.html"), page);
}

const cards = docs
  .map(
    (d) => `      <a class="si-card" href="/research/${d.slug}/">
        <span class="si-card__dtype">${d.isoDate ?? "undated"} · approved ${d.approval?.decided_at ?? "unknown"}</span>
        <span class="si-card__title">${escapeHtml(d.title)}</span>
        <span class="si-card__desc">${escapeHtml(d.description || d.excerpt)}</span>
        <span class="si-card__meta">${filetagsToTags(d.filetags, d.tags).slice(0, 4).map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</span>
      </a>`,
  )
  .join("\n");

writeFileSync(
  join(outRoot, "index.html"),
  renderPage({
    title: "StarIntel Research",
    description:
      "Published StarIntel Auto Research: autonomous OSINT research that has passed explicit human approval gates, with full provenance.",
    canonical: `${BASE}/`,
    baseUrl: "https://starintel.actor",
    nav: NAV,
    contentHtml: `  <section class="si-hero" style="padding-top:2.5rem">
    <p class="si-hero__kicker">Auto Research · approval-gated</p>
    <h1 class="si-hero__title" style="font-size:2rem">Research</h1>
    <p class="si-hero__lede">Published output of StarIntel Auto Research. Every document here passed an explicit human approval gate with recorded evidence, and carries its source repository, path, commit, and content hash. Nothing publishes merely because it exists.</p>
  </section>
  <section class="si-grid" style="margin-top:2rem">
${cards || '      <div class="si-card"><span class="si-card__title">No public research published yet</span><span class="si-card__desc">Publication is fail closed: documents appear here only when explicitly approved and allowlisted.</span></div>'}
  </section>`,
  }),
);
writeFileSync(
  join(outRoot, "sitemap.xml"),
  renderSitemap([
    { loc: `${BASE}/` },
    ...docs.map((d) => ({ loc: `${BASE}/${d.slug}/`, lastmod: d.isoDate })),
  ]),
);
console.log(`research: rendered ${docs.length} doc(s) -> public/research`);

function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
