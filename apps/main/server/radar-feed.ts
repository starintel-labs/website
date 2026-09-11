/**
 * RabbitMQ consumer feeding the radar projector. Optional: when RABBIT_URL
 * is unset the radar renders standby. Fail closed on unrecognized routing.
 */
import type { ChannelModel } from "amqplib";
import type { Config } from "./config.ts";
import { projectDelivery, RadarAggregator, type PublicRadarEvent, type RateTotals } from "./projector.ts";

export class RadarFeed {
  #cfg: Config;
  #aggregator: RadarAggregator;
  #conn: ChannelModel | null = null;
  #state: "off" | "connecting" | "live" | "down" = "off";
  #retryMs = 3000;
  #retryTimer: NodeJS.Timeout | undefined;
  #started = false;

  constructor(
    cfg: Config,
    onEvents: (events: PublicRadarEvent[]) => void,
    onRate: (totals: RateTotals, rps: number) => void,
  ) {
    this.#cfg = cfg;
    this.#aggregator = new RadarAggregator(cfg.radarFrameMs, (events, totals) => {
      onEvents(events);
      onRate(totals, this.#aggregator.currentRate());
    });
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
    this.#aggregator.start();
    void this.connect();
  }

  stop(): void {
    this.#started = false;
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    this.#aggregator.stop();
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
        const event = projectDelivery(msg.fields.routingKey, msg.content.length);
        if (event) this.#aggregator.add(event);
        ch.ack(msg);
      });
    } catch {
      if (conn && this.#conn === conn) this.#conn = null;
      void conn?.close().catch(() => {});
      this.#scheduleReconnect();
    }
  }
}
