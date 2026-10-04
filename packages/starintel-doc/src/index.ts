/** Native StarLang-generated 0.10.1 boundary. Historical readers: ./legacy. */
import { assertDocument, parseJson, SPEC_VERSION } from "starintel_doc";
export * from "./public.ts";
export { parseJson };
export const STARINTEL_SCHEMA_VERSION = SPEC_VERSION;

export interface StarIntelDocument {
  id: string;
  dataset: string;
  dtype: string;
  schemaVersion: "0.10.1";
  createdAt?: number;
  updatedAt?: number;
  visibility?: string;
  sensitivity?: string;
  deleted?: boolean;
  tags?: string[];
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export function validateCanonical(doc: unknown): StarIntelDocument {
  return assertDocument(doc) as StarIntelDocument;
}

export function validateCanonicalLine(line: string): StarIntelDocument {
  if (!line.trim()) throw new Error("empty NDJSON line");
  return validateCanonical(parseJson(line));
}

/** CouchDB metadata is transport-only; it must not override canonical identity. */
export function fromCouchDocument(value: unknown): StarIntelDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected CouchDB document object");
  }
  const { _id, _rev, ...document } = value as Record<string, unknown>;
  if (_id !== undefined && _id !== document.id)
    throw new Error("CouchDB identity mismatch");
  if (_rev !== undefined && typeof _rev !== "string")
    throw new Error("invalid CouchDB revision");
  return validateCanonical(document);
}
