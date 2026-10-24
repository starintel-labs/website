/**
 * Public-safe projections of StarIntel documents.
 *
 * ALLOWLIST ONLY. Unknown fields fail closed: they are dropped, never passed
 * through. Internal infrastructure names must never appear in projections.
 */

export const PUBLIC_DOCUMENT_FIELDS = [
  "_id",
  "dtype",
  "dataset",
  "title",
  "summary",
  "description",
  "date_added",
  "date_updated",
  "tags",
  "keywords",
] as const;

export type PublicDocumentField = (typeof PUBLIC_DOCUMENT_FIELDS)[number];

export interface PublicDocument {
  _id: string;
  dtype: string;
  dataset: string;
  title?: string;
  summary?: string;
  description?: string;
  date_added: string;
  date_updated: string;
  tags?: string[];
  keywords?: string[];
}

/** Project a validated v0.9 document onto the public allowlist. */
export function projectPublicDocument(doc: StarIntelV09DocLike): PublicDocument {
  const out: PublicDocument = {
    _id: String(doc._id),
    dtype: String(doc.dtype),
    dataset: String(doc.dataset),
    date_added: String(doc.date_added),
    date_updated: String(doc.date_updated),
  };
  if (typeof doc.title === "string" && doc.title.length > 0) out.title = doc.title;
  if (typeof doc.summary === "string" && doc.summary.length > 0) out.summary = doc.summary;
  if (typeof doc.description === "string" && doc.description.length > 0) {
    out.description = doc.description;
  }
  if (Array.isArray(doc.tags)) {
    out.tags = doc.tags.filter((t): t is string => typeof t === "string").slice(0, 16);
  }
  if (Array.isArray(doc.keywords)) {
    out.keywords = doc.keywords.filter((k): k is string => typeof k === "string").slice(0, 16);
  }
  return out;
}

export interface StarIntelV09DocLike {
  _id: unknown;
  dtype: unknown;
  dataset: unknown;
  title?: unknown;
  summary?: unknown;
  description?: unknown;
  date_added: unknown;
  date_updated: unknown;
  tags?: unknown;
  keywords?: unknown;
  handling?: unknown;
}

/**
 * Eligibility gate for public discovery.
 * Require the pinned schema's explicit public visibility and safety flags.
 */
export function isPublicEligible(doc: StarIntelV09DocLike): boolean {
  const h = doc.handling;
  if (h === null || typeof h !== "object") return false;
  const rec = h as Record<string, unknown>;
  return rec.visibility === "public" &&
    rec.pii === false &&
    rec.sensitive === false &&
    (rec.classification === undefined || rec.classification === "public" || rec.classification === "unclassified") &&
    (rec.embargo_until === undefined || rec.embargo_until === null);
}

/**
 * Scrub any occurrence of internal infrastructure domains from text fields.
 * The internal operational domain is `star.intel`; the public domain is
 * `starintel.actor`. Projections must never leak the former.
 */
const INTERNAL_DOMAIN_RE = /([a-z0-9-]+\.)*star\.intel\b/gi;

export function scrubInternal(text: string): string {
  return text.replaceAll(INTERNAL_DOMAIN_RE, "[redacted]");
}

export function assertNoInternalDomains(value: string): void {
  if (INTERNAL_DOMAIN_RE.test(value)) {
    throw new Error(`internal infrastructure domain leaked in public payload: ${value}`);
  }
}
