/**
 * RabbitMQ consumer feeding the radar projector. Optional: when RABBIT_URL
 * is unset the radar renders standby. Fail closed on unrecognized routing.
 */
import type { ChannelModel } from "amqplib";
import type { Config } from "./config.ts";
import { projectDelivery, projectAggregateDelivery, RADAR_SCOPES, RadarAggregator, type PublicRadarEvent, type RateTotals, type RadarScope } from "./projector.ts";
import { isPublicEligible, isTenantMetadataKey } from "@starintel/starintel-doc";

/** Legacy public-tenant events are public; explicit handling still takes precedence. */
export function isPublicRadarDelivery(body: Buffer, publicTenantId: string): boolean {
  try {
    const doc: unknown = JSON.parse(body.toString("utf8"));
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return false;
    const candidate = doc as Record<string, unknown>;
    if (candidate.tenant_id !== publicTenantId) return false;
    if (Object.keys(candidate).some((key) => key !== "tenant_id" && isTenantMetadataKey(key))) return false;
    // Current StarLang documents carry these restrictions at the top level.
    if (Object.hasOwn(candidate, "visibility") && candidate.visibility !== "public") return false;
    if (Object.hasOwn(candidate, "sensitivity") && candidate.sensitivity !== "public") return false;
    if (Object.hasOwn(candidate, "deleted") && candidate.deleted !== false) return false;
    if (Object.hasOwn(candidate, "accessControl")) return false;
    // Radar emits counters, not documents: do not require the historical v0.9 envelope.
    return !Object.hasOwn(candidate, "handling") || isPublicEligible(candidate);
  } catch {
    return false;
  }
}

export class RadarFeed {
  #cfg: Config;
  #aggregators: Record<RadarScope, RadarAggregator>;
  #conn: ChannelModel | null = null;
  #state: "off" | "connecting" | "live" | "down" = "off";
  #retryMs = 3000;
  #retryTimer: NodeJS.Timeout | undefined;
  #started = false;

  constructor(
    cfg: Config,
    onEvents: (events: PublicRadarEvent[], scope: RadarScope) => void,
    onRate: (totals: RateTotals, rps: number, scope: RadarScope) => void,
  ) {
    this.#cfg = cfg;
    const aggregator = (scope: RadarScope) => new RadarAggregator(cfg.radarFrameMs, (events, totals) => {
      onEvents(events, scope);
      onRate(totals, this.#aggregators[scope].currentRate(), scope);
    });
    this.#aggregators = { public: aggregator("public"), aggregate: aggregator("aggregate") };
  }

  get state(): string {
    return this.#state;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    if (!this.#cfg.rabbitUrl) {
      this.#state = "off";
      return;
    }
    for (const scope of RADAR_SCOPES) this.#aggregators[scope].start();
    void this.connect();
  }

  stop(): void {
    this.#started = false;
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    for (const scope of RADAR_SCOPES) this.#aggregators[scope].stop();
    const conn = this.#conn;
    this.#conn = null;
    this.#state = "off";
    void conn?.close().catch(() => {});
  }

  #scheduleReconnect(): void {
    if (!this.#started || this.#retryTimer) return;
    this.#state = "down";
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = undefined;
      void this.connect();
    }, this.#retryMs);
    this.#retryTimer.unref?.();
  }

  async connect(): Promise<void> {
    if (!this.#started || !this.#cfg.rabbitUrl) return;
    this.#state = "connecting";
    let conn: ChannelModel | null = null;
    try {
      const amqp = await import("amqplib");
      conn = await amqp.connect(this.#cfg.rabbitUrl);
      if (!this.#started) {
        await conn.close().catch(() => {});
        return;
      }
      this.#conn = conn;
      conn.on("error", () => {
        if (this.#started) this.#state = "down";
      });
      conn.on("close", () => {
        if (this.#conn === conn) this.#conn = null;
        this.#scheduleReconnect();
      });

      const ch = await conn.createChannel();
      // Radar is a consumer of the established event plane, never its owner.
      // Passive-check the canonical exchange instead of creating/reconfiguring it.
      await ch.checkExchange(this.#cfg.rabbitExchange);
      const q = await ch.assertQueue("", { exclusive: true, autoDelete: true });
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "documents.new.#");
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "documents.ingest.#");
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "documents.updated.#");
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "actors.#");
      this.#state = "live";
      await ch.consume(q.queue, (msg) => {
        if (!msg) return;
        this.#aggregators.aggregate.add(projectAggregateDelivery(msg.fields.routingKey, msg.content.length));
        const event = isPublicRadarDelivery(msg.content, this.#cfg.publicTenantId)
          ? projectDelivery(msg.fields.routingKey, msg.content.length)
          : null;
        if (event) this.#aggregators.public.add(event);
        ch.ack(msg);
      });
    } catch {
      if (conn && this.#conn === conn) this.#conn = null;
      void conn?.close().catch(() => {});
      this.#scheduleReconnect();
    }
  }
}
