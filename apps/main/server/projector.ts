/**
 * Radar projector: RabbitMQ event plane -> PUBLIC SAFE stream.
 *
 * ALLOWLIST ONLY. The projector parses the routing key and message size; it
 * never inspects or forwards message bodies. Anything unrecognized is
 * counted as `unknown` and carries no other information (fail closed).
 */

export const RADAR_EVENT_FAMILIES = ["document", "actor", "system", "unknown"] as const;
export const RADAR_SIZE_BUCKETS = ["s", "m", "l", "xl"] as const;

/** Public-safe event: the complete schema the browser may ever receive. */
export interface PublicRadarEvent {
  t: string;
  family: (typeof RADAR_EVENT_FAMILIES)[number];
  kind: string;
  dtype?: string;
  size_bucket: (typeof RADAR_SIZE_BUCKETS)[number];
  count: number;
}

interface PendingAggregate {
  t: string;
  family: string;
  kind: string;
  dtype?: string;
  size_bucket: string;
  count: number;
}

const DTYPE_RE = /^[a-z][a-z0-9-]{0,63}$/;
const KIND_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const DOCUMENT_KINDS = new Set(["new", "ingest", "updated"]);

export function sizeBucket(bytes: number): (typeof RADAR_SIZE_BUCKETS)[number] {
  if (bytes < 2048) return "s";
  if (bytes < 65_536) return "m";
  if (bytes < 1_048_576) return "l";
  return "xl";
}

/**
 * Project a raw AMQP delivery onto the public schema.
 * Routing keys look like `documents.new.<dtype>`, `documents.ingest.<dtype>`,
 * `documents.updated.<dtype>`, or `actors.<name>.<action>`. Only the shape is
 * interpreted, never the payload.
 */
export function projectDelivery(routingKey: string, payloadBytes: number, now = new Date()): PublicRadarEvent | null {
  const parts = routingKey.split(".");
  let family: string;
  let kind: string;
  let dtype: string | undefined;

  if (parts[0] === "documents" && DOCUMENT_KINDS.has(parts[1] ?? "") && parts.length === 3) {
    family = "document";
    kind = parts[1]!;
    dtype = DTYPE_RE.test(parts[2] ?? "") ? parts[2] : undefined;
    if (!dtype) {
      // Unrecognized dtype string: keep only family/kind, drop the value.
      family = "unknown";
      kind = KIND_RE.test(parts[1] ?? "") ? parts[1]! : "event";
    }
  } else if (parts[0] === "actors" && parts.length >= 2) {
    family = "actor";
    kind = KIND_RE.test(parts.at(-1) ?? "") ? parts.at(-1)! : "event";
  } else {
    family = "unknown";
    kind = "event";
  }

  return {
    t: now.toISOString(),
    family: family as PublicRadarEvent["family"],
    kind,
    ...(dtype ? { dtype } : {}),
    size_bucket: sizeBucket(payloadBytes),
    count: 1,
  };
}

/** Batches raw events into compact public frames with preserved counts. */
export class RadarAggregator {
  #pending = new Map<string, PendingAggregate>();
  #frameMs: number;
  #onFrame: (events: PublicRadarEvent[], totals: RateTotals) => void;
  #totals: RateTotals = { total: 0, families: {}, sizes: {} };
  #rateWindow: { at: number; count: number }[] = [];
  #timer: NodeJS.Timeout | undefined;

  constructor(frameMs: number, onFrame: (events: PublicRadarEvent[], totals: RateTotals) => void) {
    this.#frameMs = frameMs;
    this.#onFrame = onFrame;
  }

  add(event: PublicRadarEvent): void {
    const key = `${event.family}|${event.kind}|${event.dtype ?? ""}|${event.size_bucket}`;
    const cur = this.#pending.get(key);
    const t = event.t;
    if (cur) cur.count += event.count;
    else this.#pending.set(key, { t, family: event.family, kind: event.kind, dtype: event.dtype, size_bucket: event.size_bucket, count: event.count });

    this.#totals.total += event.count;
    this.#totals.families[event.family] = (this.#totals.families[event.family] ?? 0) + event.count;
    this.#totals.sizes[event.size_bucket] = (this.#totals.sizes[event.size_bucket] ?? 0) + event.count;
    this.#rateWindow.push({ at: Date.now(), count: event.count });
  }

  currentRate(): number {
    const cutoff = Date.now() - 10_000;
    while (this.#rateWindow.length > 0 && this.#rateWindow[0]!.at < cutoff) this.#rateWindow.shift();
    const span = Math.min(10_000, Math.max(1000, Date.now() - (this.#rateWindow[0]?.at ?? Date.now())));
    const count = this.#rateWindow.reduce((a, b) => a + b.count, 0);
    return (count / span) * 1000;
  }

  totals(): RateTotals {
    return { total: this.#totals.total, families: { ...this.#totals.families }, sizes: { ...this.#totals.sizes } };
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => this.flush(), this.#frameMs);
    this.#timer.unref?.();
  }

  flush(): void {
    if (this.#pending.size > 0) {
      const events = [...this.#pending.values()].map((p) => ({
        t: p.t,
        family: p.family as PublicRadarEvent["family"],
        kind: p.kind,
        ...(p.dtype ? { dtype: p.dtype } : {}),
        size_bucket: p.size_bucket as PublicRadarEvent["size_bucket"],
        count: p.count,
      }));
      this.#pending.clear();
      this.#onFrame(events, this.totals());
    }
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }
}

export interface RateTotals {
  total: number;
  families: Record<string, number>;
  sizes: Record<string, number>;
}
