/** Shared SEO helpers for StarIntel web properties. */

export interface MetaPage {
  title: string;
  description: string;
  canonical: string;
  type?: "website" | "article";
  siteName?: string;
  image?: string;
  publishedTime?: string;
  modifiedTime?: string;
  tags?: string[];
  authors?: string[];
  robots?: string;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function metaTags(m: MetaPage): string {
  const site = m.siteName ?? "StarIntel";
  const rows = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(m.canonical)}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.canonical)}">`,
    `<meta property="og:type" content="${m.type ?? "website"}">`,
    `<meta property="og:site_name" content="${esc(site)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(m.title)}">`,
    `<meta name="twitter:description" content="${esc(m.description)}">`,
  ];
  if (m.image) {
    rows.push(
      `<meta property="og:image" content="${esc(m.image)}">`,
      `<meta name="twitter:image" content="${esc(m.image)}">`,
    );
  }
  if (m.publishedTime) {
    rows.push(`<meta property="article:published_time" content="${esc(m.publishedTime)}">`);
  }
  if (m.modifiedTime) {
    rows.push(`<meta property="article:modified_time" content="${esc(m.modifiedTime)}">`);
  }
  for (const t of m.tags ?? []) {
    rows.push(`<meta property="article:tag" content="${esc(t)}">`);
  }
  for (const a of m.authors ?? []) {
    rows.push(`<meta name="author" content="${esc(a)}">`);
  }
  if (m.robots) {
    rows.push(`<meta name="robots" content="${esc(m.robots)}">`);
  }
  return rows.join("\n    ");
}

export interface JsonLdArticle {
  headline: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  publisher?: string;
  keywords?: string[];
  image?: string;
}

export function articleJsonLd(a: JsonLdArticle): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.headline,
    description: a.description,
    url: a.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": a.url },
    author: { "@type": "Person", name: a.author ?? "nsaspy" },
    publisher: { "@type": "Organization", name: a.publisher ?? "StarIntel" },
  };
  if (a.datePublished) data.datePublished = a.datePublished;
  if (a.dateModified) data.dateModified = a.dateModified;
  if (a.keywords?.length) data.keywords = a.keywords.join(", ");
  if (a.image) data.image = a.image;
  return JSON.stringify(data);
}

export function jsonLdScript(json: string): string {
  return `<script type="application/ld+json">${json}</script>`;
}
