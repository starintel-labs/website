import type { Config } from "./config.ts";
import { projectPublicRecord } from "./public-documents.ts";
import type { PublicDocument } from "../shared/public-document.ts";

export interface RecentDocuments {
  documents: PublicDocument[];
  window: number;
  eligible: number;
  generated_at: string;
  stale: boolean;
  source: "live" | "snapshot" | "cache";
}

/** Small newest-first queries avoid the previous 300-full-document cold-query timeout. */
export async function fetchNewestPublic(cfg: Config, fetchImpl: typeof fetch = fetch): Promise<PublicDocument[]> {
  const url = `${cfg.couchdbUrl}/${encodeURIComponent(cfg.couchdbDb)}/_design/time/_view/timeline`;
  const q = new URLSearchParams({ descending: "true", limit: String(Math.min(50, cfg.recentWindow)), include_docs: "true", reduce: "false" });
  const response = await fetchImpl(`${url}?${q}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`couchdb timeline view failed: HTTP ${response.status}`);
  if (!response.body) throw new Error("timeline response has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8 * 1024 * 1024) throw new Error("timeline response exceeds limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || !Array.isArray(body.rows)) throw new Error("invalid timeline response");
  const documents: PublicDocument[] = [];
  for (const row of body.rows.slice(0, 50)) {
    if (!row?.doc || typeof row.doc !== "object" || Array.isArray(row.doc)) continue;
    const document = projectPublicRecord(row.doc, cfg.publicTenantId);
    if (document) documents.push(document);
    if (documents.length >= cfg.recentWindow) break;
  }
  return documents;
}

/** One bounded corpus window shared by the live stream, radar bootstrap and homepage. */
export class RecentDocumentsService {
  #cfg: Config;
  #documents = new Map<string, PublicDocument>();
  #lastLive = 0;
  #lastSnapshot = 0;
  #retryAfter = 0;
  #revision = 0;
  #inflight: Promise<void> | null = null;
  #liveWaiters = new Set<() => void>();

  constructor(cfg: Config) { this.#cfg = cfg; }

  #put(document: PublicDocument): void {
    this.#documents.delete(document.id);
    this.#documents.set(document.id, document);
    while (this.#documents.size > this.#cfg.recentWindow) this.#documents.delete(this.#documents.keys().next().value!);
  }

  remember(document: PublicDocument): void {
    this.#revision++;
    this.#lastLive = Date.now();
    this.#put(document);
    for (const resolve of this.#liveWaiters) resolve();
    this.#liveWaiters.clear();
  }

  forget(id: string): boolean {
    // Even an unknown removal invalidates an older in-flight snapshot.
    this.#revision++;
    return this.#documents.delete(id);
  }

  async get(sampleSize: number, fetchImpl: typeof fetch = fetch): Promise<RecentDocuments> {
    const now = Date.now();
    const fresh = now - Math.max(this.#lastLive, this.#lastSnapshot) < this.#cfg.recentCacheMs;
    let stale = false;
    if (!fresh) {
      try {
        if (now < this.#retryAfter) throw new Error("snapshot retry backoff");
        if (!this.#inflight) {
          const revision = this.#revision;
          this.#inflight = fetchNewestPublic(this.#cfg, fetchImpl).then((documents) => {
            if (revision !== this.#revision) return;
            this.#documents.clear();
            for (const document of documents.reverse()) this.#put(document);
            this.#lastSnapshot = Date.now();
          }).finally(() => { this.#inflight = null; });
        }
        if (this.#documents.size) {
          await this.#inflight;
        } else {
          let notify!: () => void;
          const liveArrival = new Promise<void>((resolve) => { notify = resolve; this.#liveWaiters.add(resolve); });
          try { await Promise.race([this.#inflight, liveArrival]); }
          finally { this.#liveWaiters.delete(notify); }
        }
      } catch (error) {
        this.#retryAfter = Date.now() + 2000;
        if (!this.#documents.size || now - Math.max(this.#lastLive, this.#lastSnapshot) > 300_000) throw error;
        stale = true;
      }
    }
    const n = Number.isFinite(sampleSize) ? Math.max(1, Math.min(100, Math.floor(sampleSize))) : 12;
    return {
      documents: [...this.#documents.values()].reverse().slice(0, n),
      window: this.#documents.size, eligible: this.#documents.size,
      generated_at: new Date(Math.max(this.#lastLive, this.#lastSnapshot) || now).toISOString(),
      stale, source: stale ? "cache" : this.#lastLive >= this.#lastSnapshot ? "live" : "snapshot",
    };
  }
}
