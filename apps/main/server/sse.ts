/**
 * SSE hub for /radar/stream.
 */
import type { PublicRadarEvent, RateTotals } from "./projector.ts";
import { serializePublicJson } from "@starintel/starintel-doc";

export interface SseClient {
  write(chunk: string): void;
  close(): void;
}

export class SseHub {
  #clients = new Map<number, SseClient>();
  #nextId = 1;

  add(client: SseClient): number {
    const id = this.#nextId++;
    this.#clients.set(id, client);
    return id;
  }

  remove(id: number): void {
    this.#clients.delete(id);
  }

  get size(): number {
    return this.#clients.size;
  }

  closeAll(): void {
    for (const client of this.#clients.values()) {
      try {
        client.close();
      } catch {
        // Ignore disconnect races during shutdown.
      }
    }
    this.#clients.clear();
  }

  sendEvents(events: PublicRadarEvent[]): void {
    this.#broadcast(events.map((e) => `data: ${serializePublicJson(e)}\n\n`).join(""));
  }

  sendRate(totals: RateTotals, rps: number): void {
    this.#broadcast(
      `data: ${serializePublicJson({ type: "rate", rps: Number(rps.toFixed(2)), total: totals.total, families: totals.families, sizes: totals.sizes })}\n\n`,
    );
  }

  #broadcast(chunk: string): void {
    for (const [id, client] of this.#clients.entries()) {
      try {
        client.write(chunk);
      } catch {
        this.#clients.delete(id);
      }
    }
  }
}
