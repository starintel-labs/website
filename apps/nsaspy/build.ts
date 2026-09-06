/**
 * nsaspy.starintel.actor static builder.
 * Resume, portfolio, and a Roam-inspired public daily feed. Backlinks and
 * prev/next are generated statically from the published corpus; no graph DB.
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
const contentDir = join(websiteRoot, "content", "nsaspy");
const dist = join(here, "dist");
const BASE = "https://nsaspy.starintel.actor";

const manifest = readManifest(contentDir);
const all = normalize(manifest);
const DAILY_RE = /^\d{4}-\d{2}-\d{2}$/;

const dailies = all.filter((d) => DAILY_RE.test(d.slug));
const projects = all.filter((d) => !DAILY_RE.test(d.slug) && !["resume", "about"].includes(d.slug));
const resume = all.find((d) => d.slug === "resume");
const about = all.find((d) => d.slug === "about");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(websiteRoot, "packages", "design", "src", "css"), join(dist, "css"), { recursive: true });

const NAV = [
  { href: "/", label: "Dailies", current: true },
  { href: "/resume/", label: "Resume" },
  { href: "/projects/", label: "Portfolio" },
  { href: "/about/", label: "About" },
  { href: "https://starintel.actor/", label: "starintel.actor", external: true },
];

/** Static backlinks: which published docs link to a slug? */
function backlinksFor(slug: string, docs: { slug: string }[]): string[] {
  const needle = `/${slug}/`;
  const out: string[] = [];
  for (const d of docs) {
    if (d.slug === slug) continue;
    let html: string;
    try {
      html = readDocHtml(contentDir, d.slug);
    } catch {
      continue;
    }
    if (html.includes(`href="${needle}"`) || html.includes(needle)) out.push(d.slug);
  }
  return out;
}

// ---- Article pages (projects, resume, about, dailies) ----
const dailyIdx = new Map(dailies.map((d, i) => [d.slug, i] as const));

for (const doc of all) {
  const html = readDocHtml(contentDir, doc.slug);
  const tags = filetagsToTags(doc.filetags, doc.tags);
  let extra = "";
  let section: "daily" | "projects" | "root";
  if (DAILY_RE.test(doc.slug)) section = "daily";
  else if (projects.some((p) => p.slug === doc.slug)) section = "projects";
  else section = "root";
  const navCurrent = { daily: "Dailies", projects: "Portfolio", root: doc.slug === "resume" ? "Resume" : doc.slug === "about" ? "About" : undefined }[section];

  if (section === "daily") {
    const i = dailyIdx.get(doc.slug)!;
    const prev = dailies[i + 1]; // normalize() sorted desc: i+1 is older
    const next = dailies[i - 1];
    const links = [
      prev ? `<a class="si-chip" href="/daily/${prev.slug}/">← ${prev.slug}</a>` : "",
      next ? `<a class="si-chip" href="/daily/${next.slug}/">${next.slug} →</a>` : "",
    ]
      .filter(Boolean)
      .join("\n      ");
    const backlinks = backlinksFor(doc.slug, dailies).filter((b) => DAILY_RE.test(b));
    const backlinksHtml = backlinks.length
      ? `\n      <p style="margin-top:1rem">${backlinks.map((b) => `<a class="si-chip" href="/daily/${b}/">↔ ${b}</a>`).join(" ")}</p>`
      : "";
    extra = `\n  <nav class="mono" style="margin-top:2.5rem;display:flex;gap:0.5rem;flex-wrap:wrap">\n      ${links}${backlinksHtml}\n  </nav>`;
  }

  const article = renderOrgArticle({ doc, html, tagList: tags });
  const page = renderPage({
    title: `${doc.title} — nsaspy`,
    description: doc.description || doc.excerpt.slice(0, 150),
    canonical:
      section === "daily"
        ? `${BASE}/daily/${doc.slug}/`
        : section === "projects"
          ? `${BASE}/projects/${doc.slug}/`
          : `${BASE}/${doc.slug}/`,
    baseUrl: BASE,
    nav: NAV.map((n) => ({ ...n, current: n.label === navCurrent })),
    contentHtml: article.html + extra,
    jsonLd: articleJsonLd({
      headline: doc.title,
      description: doc.description || doc.excerpt.slice(0, 150),
      url:
        section === "daily"
          ? `${BASE}/daily/${doc.slug}/`
          : section === "projects"
            ? `${BASE}/projects/${doc.slug}/`
            : `${BASE}/${doc.slug}/`,
      datePublished: doc.isoDate,
      author: doc.author ?? "nsaspy",
      keywords: tags,
    }),
    feedHref: section === "daily" ? "/feed.xml" : null,
    css:
      doc.slug === "resume"
        ? [...new Set(["/css/tokens.css", "/css/base.css", "/css/layout.css", "/css/org.css"])]
        : undefined,
  });
  const dir =
    section === "daily"
      ? join(dist, "daily", doc.slug)
      : section === "projects"
        ? join(dist, "projects", doc.slug)
        : join(dist, doc.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), page);
}

// ---- Index: daily feed with YYYY/MM grouping ----
const groups = new Map<string, typeof dailies>();
for (const d of dailies) {
  const ym = d.slug.slice(0, 7);
  if (!groups.has(ym)) groups.set(ym, []);
  groups.get(ym)!.push(d);
}
const feedHtml = [...groups.entries()]
  .map(
    ([ym, ds]) => `    <section class="si-section" style="padding:1.2rem 0">
      <h2 class="mono faint" style="font-size:0.8rem;letter-spacing:0.16em">${ym}</h2>
      <div class="si-grid">
${ds
  .map(
    (d) => `        <a class="si-card" href="/daily/${d.slug}/">
          <span class="si-card__dtype">${d.slug}</span>
          <span class="si-card__title">${escapeHtml(d.title)}</span>
          <span class="si-card__desc">${escapeHtml(d.excerpt || d.description)}</span>
        </a>`,
  )
  .join("\n")}
      </div>
    </section>`,
  )
  .join("\n");

const index = renderPage({
  title: "nsaspy — dailies",
  description: "Public daily notes from the StarIntel workshop: what shipped, what broke, what got verified.",
  canonical: `${BASE}/`,
  baseUrl: BASE,
  nav: NAV,
  contentHtml: `  <section class="si-hero" style="padding-top:2.5rem">
    <p class="si-hero__kicker">nsaspy · public dailies</p>
    <h1 class="si-hero__title" style="font-size:2rem">Dailies</h1>
    <p class="si-hero__lede">Public daily notes from the StarIntel workshop — reverse chronological, Roam-style, with static backlinks and full provenance.</p>
  </section>
  <nav class="mono" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin:1.5rem 0">
    <a class="si-chip si-chip--gold" href="/resume/">Resume</a>
    <a class="si-chip" href="/projects/">Portfolio</a>
    <a class="si-chip" href="/about/">About</a>
  </nav>
${feedHtml || '  <div class="si-panel"><p class="muted">No dailies published yet.</p></div>'}`,
  feedHref: "/feed.xml",
});
writeFileSync(join(dist, "index.html"), index);

// ---- Portfolio index ----
const portfolioCards = projects
  .map(
    (p) => `      <a class="si-card" href="/projects/${p.slug}/">
        <span class="si-card__dtype">project</span>
        <span class="si-card__title">${escapeHtml(p.title)}</span>
        <span class="si-card__desc">${escapeHtml(p.description || p.excerpt)}</span>
      </a>`,
  )
  .join("\n");
writeFileSync(
  join(dist, "projects", "index.html"),
  renderPage({
    title: "Portfolio — nsaspy",
    description: "Selected StarIntel projects and systems.",
    canonical: `${BASE}/projects/`,
    baseUrl: BASE,
    nav: NAV.map((n) => ({ ...n, current: n.label === "Portfolio" })),
    contentHtml: `  <section class="si-section" style="padding-top:2.5rem">
    <h1 class="si-section__title">Portfolio</h1>
    <div class="si-grid" style="margin-top:1.4rem">
${portfolioCards || '      <div class="si-card"><span class="si-card__title">No projects published yet.</span></div>'}
    </div>
  </section>`,
  }),
);

// ---- RSS + sitemap ----
writeFileSync(
  join(dist, "feed.xml"),
  renderRss({
    title: "nsaspy — dailies",
    description: "Public daily notes from the StarIntel workshop.",
    baseUrl: BASE,
    path: "/",
    docs: dailies.map((d) => ({
      slug: d.slug,
      title: d.title,
      isoDate: d.isoDate,
      excerpt: d.description || d.excerpt,
      url: `${BASE}/daily/${d.slug}/`,
    })),
  }),
);
const sitemapUrls = [
  { loc: `${BASE}/` },
  { loc: `${BASE}/resume/` },
  { loc: `${BASE}/projects/` },
  { loc: `${BASE}/about/` },
  ...dailies.map((d) => ({ loc: `${BASE}/daily/${d.slug}/`, lastmod: d.isoDate })),
  ...projects.map((p) => ({ loc: `${BASE}/projects/${p.slug}/`, lastmod: p.isoDate })),
];
writeFileSync(join(dist, "sitemap.xml"), renderSitemap(sitemapUrls));

console.log(
  `nsaspy: built ${dailies.length} daily(s), ${projects.length} project(s), resume: ${resume ? "yes" : "no"}, about: ${about ? "yes" : "no"} -> dist/`,
);

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
