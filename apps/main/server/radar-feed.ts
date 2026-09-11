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

  async connect(): Promise<void> {
    if (!this.#started || !this.#cfg.rabbitUrl) return;
    this.#state = "connecting";
    try {
      const amqp = await import("amqplib");
      const conn = await amqp.connect(this.#cfg.rabbitUrl);
      if (!this.#started) {
        await conn.close().catch(() => {});
        return;
      }
      this.#conn = conn;
      const ch = await conn.createChannel();
      await ch.assertExchange(this.#cfg.rabbitExchange, "topic", { durable: true });
      const q = await ch.assertQueue("", { exclusive: true, autoDelete: true });
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "documents.new.*");
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "documents.ingest.*");
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "documents.updated.*");
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "actors.*");
      this.#state = "live";
      await ch.consume(q.queue, (msg) => {
        if (!msg) return;
        const event = projectDelivery(msg.fields.routingKey, msg.content.length);
        if (event) this.#aggregator.add(event);
        ch.ack(msg);
      });
    } catch {
      this.#conn = null;
      if (!this.#started) return;
      this.#state = "down";
      this.#retryTimer = setTimeout(() => {
        this.#retryTimer = undefined;
        void this.connect();
      }, this.#retryMs);
      this.#retryTimer.unref?.();
    }
  }
}
