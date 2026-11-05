import type { PublicDocument } from "../shared/public-document.ts";

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function documentDate(value?: string): string {
  if (!value) return "Date not provided";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : "Date not provided";
}

export function documentReader(doc: PublicDocument): HTMLElement {
  const article = element("article", "document-reader");
  const header = element("header", "document-reader__header");
  header.append(element("span", "document-type", doc.dtype));
  const title = element("h2", "document-reader__title", doc.title);
  title.id = "document-reader-title";
  header.append(title, element("p", "document-reader__origin", `${doc.dataset} · ${documentDate(doc.updatedAt)}`));
  article.append(header);
  if (doc.summary) article.append(element("p", "document-reader__body", doc.summary));
  const fields = element("dl", "document-reader__fields");
  for (const field of [{ label: "Document ID", value: doc.id }, ...doc.fields]) {
    fields.append(element("dt", "", field.label), element("dd", "", field.value));
  }
  article.append(fields);
  const urls = [...new Set([doc.url, ...(doc.sourceUrls ?? [])].filter((url): url is string => typeof url === "string" && /^https?:\/\//.test(url)))];
  for (const [index, url] of urls.entries()) {
    const source = element("a", "document-reader__source", urls.length === 1 ? "Open source ↗" : `Source ${index + 1} ↗`);
    source.href = url;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    article.append(source);
  }
  const details = element("details", "document-reader__json");
  details.append(element("summary", "", "Inspect public fields"), element("pre", "", JSON.stringify(doc, null, 2)));
  article.append(details);
  return article;
}

export function documentCard(doc: PublicDocument): HTMLElement {
  const article = element("article", "si-card public-document-card");
  article.append(element("span", "document-type", doc.dtype));
  const title = element("h3", "si-card__title");
  const link = element("a", "", doc.title);
  link.href = `/radar#document=${encodeURIComponent(doc.id)}`;
  title.append(link);
  article.append(title);
  if (doc.summary) article.append(element("p", "si-card__desc", doc.summary.slice(0, 240)));
  article.append(element("p", "si-card__meta", `${doc.dataset} · ${documentDate(doc.updatedAt)}`));
  return article;
}
