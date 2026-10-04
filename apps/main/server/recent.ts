/**
 * Recent public documents.
 *
 * newest <=100 eligible PUBLIC documents -> random sample -> allowlisted
 * projection. The browser never sees anything but the projection; CouchDB
 * never sees the browser.
 */
import {
  fromCouchDocument,
  parseJson,
  isPublicEligible,
  projectPublicDocument,
  assertNoInternalDomains,
  type StarIntelDocument,
} from "@starintel/starintel-doc";
import type { Config } from "./config.ts";

export interface RecentDocuments {
  documents: ReturnType<typeof projectPublicDocument>[];
  window: number;
  eligible: number;
  generated_at: string;
}

interface TimelineRow {
  id: string;
  doc?: Record<string, unknown>;
}

/** Fetch full docs from the private CouchDB timeline view (newest first). */
export async function fetchNewestPublic(
  cfg: Config,
  fetchImpl: typeof fetch = fetch,
): Promise<StarIntelDocument[]> {
  const url = `${cfg.couchdbUrl}/${encodeURIComponent(cfg.couchdbDb)}/_design/time/_view/timeline`;
  const q = new URLSearchParams({
    descending: "true",
    limit: String(cfg.recentWindow * 3),
    include_docs: "true",
  });
  const res = await fetchImpl(`${url}?${q}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok)
    throw new Error(`couchdb timeline view failed: HTTP ${res.status}`);
  const body = parseJson(await res.text()) as { rows?: TimelineRow[] };
  const rows = body.rows ?? [];
  const out: StarIntelDocument[] = [];
  for (const row of rows) {
    if (!row.doc) continue;
    const doc = fromCouchDocument(row.doc); // throws on invalid: fail closed
    if (isPublicEligible(doc)) out.push(doc);
    if (out.length >= cfg.recentWindow) break;
  }
  return out;
}

/** Fisher-Yates sample without replacement. */
export function sample<T>(items: T[], n: number): T[] {
  const arr = [...items];
  const take = Math.min(n, arr.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.slice(0, take);
}

export class RecentDocumentsService {
  #cfg: Config;
  #cache: { at: number; value: RecentDocuments } | null = null;
  #inflight: Promise<RecentDocuments> | null = null;

  constructor(cfg: Config) {
    this.#cfg = cfg;
  }

  async get(
    sampleSize: number,
    fetchImpl: typeof fetch = fetch,
  ): Promise<RecentDocuments> {
    const now = Date.now();
    if (this.#cache && now - this.#cache.at < this.#cfg.recentCacheMs) {
      return this.#withSample(this.#cache.value, sampleSize);
    }
    if (!this.#inflight) {
      this.#inflight = fetchNewestPublic(this.#cfg, fetchImpl)
        .then((docs) => {
          const value: RecentDocuments = {
            documents: docs.map(projectPublicDocument),
            window: docs.length,
            eligible: docs.length,
            generated_at: new Date().toISOString(),
          };
          for (const d of value.documents)
            assertNoInternalDomains(JSON.stringify(d));
          this.#cache = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          this.#inflight = null;
        });
    }
    return this.#withSample(await this.#inflight, sampleSize);
  }

  #withSample(value: RecentDocuments, sampleSize: number): RecentDocuments {
    const n = Math.max(1, Math.min(sampleSize, 100));
    return { ...value, documents: sample(value.documents, n) };
  }
}
