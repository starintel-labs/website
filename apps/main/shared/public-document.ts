/** Website presentation projection, not a replacement StarIntel wire schema. */
export interface PublicDocument {
  id: string;
  dtype: string;
  dataset: string;
  title: string;
  summary?: string;
  updatedAt?: string;
  url?: string;
  sourceUrls?: string[];
  fields: { label: string; value: string }[];
}

export interface DocumentFrame {
  documents: PublicDocument[];
  removed: string[];
}

const DISPLAY_KEYS = new Set(["id", "dtype", "dataset", "title", "summary", "updatedAt", "url", "sourceUrls", "fields"]);

/** Reject malformed or expanded network projections before touching the current reader. */
export function isPublicDocument(value: unknown): value is PublicDocument {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const doc = value as Record<string, unknown>;
  return Object.keys(doc).every((key) => DISPLAY_KEYS.has(key)) &&
    ["id", "dtype", "dataset", "title"].every((key) => typeof doc[key] === "string" && doc[key].length > 0) &&
    ["summary", "updatedAt", "url"].every((key) => doc[key] === undefined || typeof doc[key] === "string") &&
    (doc.sourceUrls === undefined || (Array.isArray(doc.sourceUrls) && doc.sourceUrls.every((url) => typeof url === "string"))) &&
    Array.isArray(doc.fields) && doc.fields.every((field) => field !== null && typeof field === "object" &&
      Object.keys(field).every((key) => key === "label" || key === "value") && typeof field.label === "string" && typeof field.value === "string");
}
