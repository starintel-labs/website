/** Allowlist-only public discovery. Raw data, provenance and extensions stay private. */
import type { StarIntelDocument } from "./index.ts";

export const PUBLIC_DOCUMENT_FIELDS = [
  "id",
  "dtype",
  "dataset",
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "tags",
] as const;
export type PublicDocumentField = (typeof PUBLIC_DOCUMENT_FIELDS)[number];
export interface PublicDocument {
  id: string;
  dtype: string;
  dataset: string;
  schemaVersion: "0.10.1";
  createdAt?: number;
  updatedAt?: number;
  tags?: string[];
}

/** Both canonical visibility and sensitivity must explicitly permit public use. */
export function isPublicEligible(
  doc: Pick<
    StarIntelDocument,
    "visibility" | "sensitivity" | "deleted" | "extensions"
  >,
): boolean {
  if (
    doc.visibility !== "public" ||
    doc.sensitivity !== "public" ||
    doc.deleted === true
  )
    return false;
  // Retained legacy handling restrictions always win over a new visibility label.
  for (const key of ["handling", "legacyHandling"]) {
    const handling = doc.extensions?.[key];
    if (handling && typeof handling === "object") {
      const flags = handling as Record<string, unknown>;
      if (
        flags.restricted === true ||
        flags.confidential === true ||
        flags.classified === true ||
        flags.public === false
      )
        return false;
    }
  }
  return true;
}

export function projectPublicDocument(doc: StarIntelDocument): PublicDocument {
  if (!isPublicEligible(doc))
    throw new Error("document is not eligible for public projection");
  const out: PublicDocument = {
    id: doc.id,
    dtype: doc.dtype,
    dataset: doc.dataset,
    schemaVersion: doc.schemaVersion,
  };
  if (Number.isSafeInteger(doc.createdAt)) out.createdAt = doc.createdAt;
  if (Number.isSafeInteger(doc.updatedAt)) out.updatedAt = doc.updatedAt;
  if (Array.isArray(doc.tags)) out.tags = doc.tags.slice(0, 16);
  return out;
}

const INTERNAL_DOMAIN_RE = /([a-z0-9-]+\.)*star\.intel\b/gi;
export function scrubInternal(text: string): string {
  return text.replaceAll(INTERNAL_DOMAIN_RE, "[redacted]");
}
export function assertNoInternalDomains(value: string): void {
  // Avoid stateful /g.test allowing every second identical leak through.
  if (new RegExp(INTERNAL_DOMAIN_RE.source, "i").test(value)) {
    throw new Error("internal infrastructure domain leaked in public payload");
  }
}
