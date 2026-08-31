/**
 * SSE hub for /radar/stream.
 */
import type { PublicRadarEvent, RateTotals } from "./projector.ts";

export interface SseClient {
  id: number;
  write(chunk: string): void;
  close(): void;
}

export class SseHub {
  #clients = new Map<number, SseClient>();
  #nextId = 1;

  add(client: SseClient): void {
    this.#clients.set(client.id, client);
  }

  remove(client: SseClient): void {
    this.#clients.delete(client.id);
  }

  get size(): number {
    return this.#clients.size;
  }

  sendEvents(events: PublicRadarEvent[]): void {
    this.#broadcast(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));
  }

  sendRate(totals: RateTotals, rps: number): void {
    this.#broadcast(
      `data: ${JSON.stringify({ type: "rate", rps: Number(rps.toFixed(2)), total: totals.total, families: totals.families, sizes: totals.sizes })}\n\n`,
    );
  }

  #broadcast(chunk: string): void {
    for (const client of this.#clients.values()) {
      try {
        client.write(chunk);
      } catch {
        this.#clients.delete(client.id);
      }
    }
  }
}
