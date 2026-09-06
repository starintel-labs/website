/**
 * a0-symbolics.starintel.actor static builder.
 * Symbolics-branded site for the a0-symbolics agent framework
 * (Agent Zero distribution: a Dockerized Linux desktop for agents).
 * Renders committed markdown guides from content/symbolics with provenance.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { renderPage, renderSitemap, escapeHtml } from "@starintel/content";

const here = dirname(fileURLToPath(import.meta.url));
const websiteRoot = join(here, "..", "..");
const contentDir = join(websiteRoot, "content", "symbolics");
const dist = join(here, "dist");
const BASE = "https://a0-symbolics.starintel.actor";
const BRAND = "symbolics";

interface DocMeta {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  source: { repo: string | null; path: string | null; commit: string | null; content_sha256: string; dirty?: boolean };
}

const manifest = JSON.parse(readFileSync(join(contentDir, "manifest.json"), "utf8")) as { documents: DocMeta[] };
const docs = [...manifest.documents].sort((a, b) => a.title.localeCompare(b.title));

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(websiteRoot, "packages", "design", "src", "css"), join(dist, "css"), { recursive: true });

const NAV = [
  { href: "/", label: "Overview", current: true },
  { href: "/guides/", label: "Guides", current: false },
  { href: "https://github.com/lost-rob0t/a0-symbolics", label: "Source", external: true },
  { href: "https://starintel.actor/", label: "starintel.actor", external: true },
];

// Guides are mounted flat: docs/guides/<name> -> /guides/<name>/
const guideSlug = (doc: DocMeta) => doc.slug.replace(/^docs\/guides\//, "");
const guides = docs.filter((d) => d.slug.startsWith("docs/guides/"));

// ---- Guide pages ----
for (const doc of guides) {
  const md = readFileSync(join(contentDir, `${doc.slug.replaceAll("/", "_")}.md`), "utf8");
  const body = await marked.parse(md, { async: true });
  const dirtyNote = doc.source.dirty ? " (source worktree had uncommitted changes at publish time)" : "";
  const page = renderPage({
    title: `${doc.title} — a0-symbolics`,
    description: doc.description || doc.excerpt.slice(0, 150),
    canonical: `${BASE}/guides/${guideSlug(doc)}/`,
    baseUrl: BASE,
    brand: BRAND,
    nav: NAV.map((n) => ({ ...n, current: n.label === "Guides" })),
    contentHtml: `  <article class="si-org">
    <p style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1.4rem">
      <span class="si-chip">guide</span>
      <span class="si-chip si-chip--cyan">a0-symbolics</span>
    </p>
    ${body}
    <div class="si-panel" style="margin-top:3rem;font-size:0.78rem">
      <strong class="mono" style="font-size:0.72rem;letter-spacing:0.12em;color:var(--si-accent-primary)">PROVENANCE</strong>
      <p class="muted mono" style="margin:0.6rem 0 0;font-size:0.75rem;overflow-wrap:anywhere">
        source ${escapeHtml(doc.source.repo ?? "unknown")} · ${escapeHtml(doc.source.path ?? "")}<br>
        commit ${escapeHtml((doc.source.commit ?? "").slice(0, 12))} · sha256 ${escapeHtml(doc.source.content_sha256.slice(0, 16))}…${escapeHtml(dirtyNote)}
      </p>
    </div>
  </article>`,
  });
  mkdirSync(join(dist, "guides", guideSlug(doc)), { recursive: true });
  writeFileSync(join(dist, "guides", guideSlug(doc), "index.html"), page);
}

// ---- Guides index ----
const guideCards = guides
  .map(
    (d) => `      <a class="si-card" href="/guides/${guideSlug(d)}/">
        <span class="si-card__dtype">guide</span>
        <span class="si-card__title">${escapeHtml(d.title)}</span>
        <span class="si-card__desc">${escapeHtml(d.description || d.excerpt)}</span>
      </a>`,
  )
  .join("\n");
writeFileSync(
  join(dist, "guides", "index.html"),
  renderPage({
    title: "Guides — a0-symbolics",
    description: "Operator and developer guides for the a0-symbolics agent framework.",
    canonical: `${BASE}/guides/`,
    baseUrl: BASE,
    brand: BRAND,
    nav: NAV.map((n) => ({ ...n, current: n.label === "Guides" })),
    contentHtml: `  <section class="si-section" style="padding-top:2.5rem">
    <h1 class="si-section__title">Guides</h1>
    <div class="si-grid" style="margin-top:1.4rem">
${guideCards}
    </div>
  </section>`,
  }),
);

// ---- Landing ----
const landing = renderPage({
  title: "a0-symbolics — agents with a full Linux computer",
  description:
    "a0-symbolics is a Symbolics distribution of the Agent Zero framework: a Dockerized Linux desktop, browser DOM annotation, live document cowork, projects, skills, plugins, and a host-machine bridge.",
  canonical: `${BASE}/`,
  baseUrl: BASE,
  brand: BRAND,
  nav: NAV,
  jsonLd: JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "a0-symbolics",
    applicationCategory: "DeveloperApplication",
    description:
      "Agent Zero framework distribution by Symbolics: a Dockerized Linux desktop for agents with browser DOM annotation, live document cowork, projects, skills, and plugins.",
    url: `${BASE}/`,
    author: { "@type": "Organization", name: "Symbolics" },
  }),
  contentHtml: `  <section class="si-hero">
    <p class="si-hero__kicker">Symbolics · Agent framework</p>
    <h1 class="si-hero__title" style="font-size:clamp(1.9rem,4.5vw,3rem)">Give your agent a<br><span class="si-glow">full Linux computer.</span></h1>
    <p class="si-hero__lede">
      a0-symbolics is the Symbolics distribution of the open Agent Zero framework: an agent that
      works in a real Dockerized Linux desktop — GUI software, terminals, files — with browser DOM
      annotation, live document cowork, projects and memory, a plugin hub, and a bridge back to your
      host machine. Prompts, tools, plugins, and skills stay inspectable and editable.
    </p>
    <p style="margin-top:1.6rem;display:flex;gap:0.8rem;flex-wrap:wrap">
      <a class="si-chip si-chip--gold" href="/guides/launcher/">Quick start</a>
      <a class="si-chip si-chip--cyan" href="/guides/usage/">Usage</a>
      <a class="si-chip" href="/guides/mcp-setup/">MCP setup</a>
      <a class="si-chip" href="/guides/create-plugin/">Write a plugin</a>
      <a class="si-chip" href="https://github.com/lost-rob0t/a0-symbolics" target="_blank" rel="noopener">Source ↗</a>
    </p>
  </section>

  <section class="si-shell si-section">
    <div class="si-section__head">
      <h2 class="si-section__title">What the agent gets</h2>
    </div>
    <div class="si-grid">
      <div class="si-card"><span class="si-card__dtype">Desktop</span><span class="si-card__title">Full Linux environment</span><span class="si-card__desc">Real GUI software, terminals, files, and desktop apps inside a Dockerized Canvas.</span></div>
      <div class="si-card"><span class="si-card__dtype">Browser</span><span class="si-card__title">DOM annotation</span><span class="si-card__desc">Click page elements and turn them into inspect, change, lift, or review instructions.</span></div>
      <div class="si-card"><span class="si-card__dtype">Documents</span><span class="si-card__title">Live cowork</span><span class="si-card__desc">Edit Markdown, Writer, Spreadsheet, and Presentation files together instead of losing work in chat.</span></div>
      <div class="si-card"><span class="si-card__dtype">Extensibility</span><span class="si-card__title">Plugin hub &amp; skills</span><span class="si-card__desc">Install community plugins or publish your own extension points; isolate per-project instructions, secrets, and memories.</span></div>
      <div class="si-card"><span class="si-card__dtype">Bridge</span><span class="si-card__title">Host-machine connection</span><span class="si-card__desc">The A0 CLI lets the same agent work in your real local repositories.</span></div>
      <div class="si-card"><span class="si-card__dtype">Cooperation</span><span class="si-card__title">Multi-agent delegation</span><span class="si-card__desc">Delegate research, coding, analysis, or review tasks to focused subagents.</span></div>
    </div>
  </section>

  <section class="si-shell si-section">
    <div class="si-panel">
      <p class="muted" style="margin:0;font-size:0.9rem">
        a0-symbolics is an independently maintained distribution of the open-source
        <a href="https://github.com/agent0ai/agent-zero" target="_blank" rel="noopener">Agent Zero</a> framework.
        The guides on this site are published directly from the distribution repository with recorded
        provenance — repository, path, commit, and content hash.
      </p>
    </div>
  </section>`,
});
writeFileSync(join(dist, "index.html"), landing);

writeFileSync(
  join(dist, "sitemap.xml"),
  renderSitemap([
    { loc: `${BASE}/` },
    { loc: `${BASE}/guides/` },
    ...guides.map((d) => ({ loc: `${BASE}/guides/${guideSlug(d)}/` })),
  ]),
);

console.log(`symbolics: built ${guides.length} guide(s) -> dist/`);
