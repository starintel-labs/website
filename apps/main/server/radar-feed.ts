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
    if (!this.#cfg.rabbitUrl) {
      this.#state = "off";
      return;
    }
    this.#aggregator.start();
    void this.connect();
  }

  stop(): void {
    this.#aggregator.stop();
    void this.#conn?.close().catch(() => {});
    this.#conn = null;
    this.#state = "off";
  }

  async connect(): Promise<void> {
    this.#state = "connecting";
    try {
      const amqp = await import("amqplib");
      const conn = await amqp.connect(this.#cfg.rabbitUrl!);
      this.#conn = conn;
      const ch = await conn.createChannel();
      await ch.assertExchange(this.#cfg.rabbitExchange, "topic", { durable: true });
      const q = await ch.assertQueue("", { exclusive: true, autoDelete: true });
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "documents.new.*");
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "documents.ingest.*");
      await ch.bindQueue(q.queue, this.#cfg.rabbitExchange, "actors.*");
      this.#state = "live";
      await ch.consume(q.queue, (msg) => {
        if (!msg) return;
        const event = projectDelivery(msg.fields.routingKey, msg.content.length);
        if (event) this.#aggregator.add(event);
        ch.ack(msg);
      });
    } catch {
      this.#state = "down";
      setTimeout(() => void this.connect(), this.#retryMs);
    }
  }
}
