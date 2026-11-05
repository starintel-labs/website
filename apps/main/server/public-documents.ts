import { isPublicEligible, isTenantMetadataKey, scrubInternal } from "@starintel/starintel-doc";
import type { PublicDocument } from "../shared/public-document.ts";

export type PublicRecord = Record<string, unknown>;
export const MAX_PUBLIC_RECORD_BYTES = 1_048_576;

export function parseRecord(body: Buffer): PublicRecord | null {
  if (body.length > MAX_PUBLIC_RECORD_BYTES) return null;
  try {
    const record: unknown = JSON.parse(body.toString("utf8"));
    return record !== null && typeof record === "object" && !Array.isArray(record) ? record as PublicRecord : null;
  } catch {
    return null;
  }
}

/** Current flat disclosure controls and explicit legacy handling outrank the public-tenant default. */
export function isPublicRecord(record: PublicRecord, publicTenantId: string): boolean {
  if (record.tenant_id !== publicTenantId) return false;
  if (Object.keys(record).some((key) => key !== "tenant_id" && isTenantMetadataKey(key))) return false;
  if (Object.hasOwn(record, "visibility") && record.visibility !== "public") return false;
  if (Object.hasOwn(record, "sensitivity") && record.sensitivity !== "public") return false;
  if (Object.hasOwn(record, "deleted") && record.deleted !== false) return false;
  if (Object.hasOwn(record, "_deleted") && record._deleted !== false) return false;
  if (["pii", "sensitive"].some((key) => Object.hasOwn(record, key) && record[key] !== false)) return false;
  if (Object.hasOwn(record, "accessControl")) return false;
  return !Object.hasOwn(record, "handling") || isPublicEligible(record);
}

function text(value: unknown, max = 1000): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || /\btenant[_-]?ids?\b/i.test(trimmed)) return undefined;
  return scrubInternal(trimmed).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").slice(0, max) || undefined;
}

export function recordId(record: PublicRecord): string | undefined {
  const id = record.id ?? record._id;
  if (typeof id !== "string" || id.trim().length > 512) return undefined;
  return text(id, 512);
}

export function publicUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  const raw = text(value, 2048);
  if (!raw || raw.includes("[redacted]")) return undefined;
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".intel") || host.endsWith(".localhost")) return undefined;
    if (/^[\d.]+$/.test(host) || host.includes(":")) return undefined;
    if ([...url.searchParams.keys()].some((key) => /token|secret|password|api.?key|auth|signature|session|credential|^code$|^key$/i.test(key))) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function timestamp(value: unknown): string | undefined {
  const date = typeof value === "number" && Number.isFinite(value)
    ? new Date(value < 1e12 ? value * 1000 : value)
    : typeof value === "string" ? new Date(value) : undefined;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/** Explicit display allowlist: never forward raw/data/metadata/extension maps or identity/contact secrets. */
export function projectPublicRecord(record: PublicRecord, publicTenantId: string): PublicDocument | null {
  if (!isPublicRecord(record, publicTenantId)) return null;
  const id = recordId(record);
  const dtype = text(record.dtype, 65);
  const dataset = text(record.dataset, 160);
  if (!id || !dtype || !/^[a-z][a-z0-9-]{0,63}$/.test(dtype) || !dataset) return null;
  const data = record.data !== null && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data as PublicRecord : {};
  const value = (...keys: string[]): unknown => {
    for (const source of [record, data]) for (const key of keys) {
      const candidate = source[key];
      if (candidate !== undefined && candidate !== null && !(typeof candidate === "string" && !candidate.trim())) return candidate;
    }
    return undefined;
  };
  const name = [text(value("fname"), 80), text(value("lname"), 80)].filter(Boolean).join(" ");
  const url = publicUrl(value("url", "uri", "sourceUrl", "source_url", "profileUrl", "profile_url"));
  const title = (text(value("title", "headline", "name", "displayName", "display_name", "username", "userName"), 300) ?? (name || url) ?? `${dtype} · ${id}`).slice(0, 300);
  const summary = text(value("summary", "description", "text", "content", "body"), 12_000);
  const updatedAt = timestamp(value("updatedAt", "date_updated", "createdAt", "date_added", "postedAt", "observedAt"));
  const sourceValues = value("sourceUrls", "source_urls");
  const sourceUrls = Array.isArray(sourceValues) ? [...new Set(sourceValues.slice(0, 8).map(publicUrl).filter((item): item is string => item !== undefined))].slice(0, 4) : [];
  const fields: PublicDocument["fields"] = [];
  for (const [label, keys] of [
    ["Name", ["name", "displayName", "display_name"]],
    ["Username", ["username", "userName", "handle"]],
    ["Platform", ["platform", "site"]],
    ["Author", ["author", "authorName", "author_name"]],
    ["Language", ["language"]],
    ["Relation", ["relation", "relationType", "relation_type", "predicate"]],
    ["From", ["sourceId", "source_id", "src"]],
    ["To", ["targetId", "target_id", "dst"]],
  ] as const) {
    const content = text(value(...keys), 500);
    if (content) fields.push({ label, value: content });
  }
  const tags = value("tags", "topics");
  if (Array.isArray(tags)) {
    const content = tags.slice(0, 12).map((tag) => text(tag, 60)).filter(Boolean).join(", ");
    if (content) fields.push({ label: "Tags", value: content });
  }
  return { id, dtype, dataset, title, ...(summary ? { summary } : {}), ...(updatedAt ? { updatedAt } : {}), ...(url ? { url } : {}), ...(sourceUrls.length ? { sourceUrls } : {}), fields };
}
