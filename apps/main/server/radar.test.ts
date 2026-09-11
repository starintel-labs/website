import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.ts";
import { projectDelivery } from "./projector.ts";
import { SseHub } from "./sse.ts";

test("radar defaults to the StarIntel documents exchange", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.rabbitExchange, "documents");
});

test("radar projects document update traffic", () => {
  const event = projectDelivery("documents.updated.person", 4096, new Date("2026-09-11T00:00:00Z"));
  assert.deepEqual(event, {
    t: "2026-09-11T00:00:00.000Z",
    family: "document",
    kind: "updated",
    dtype: "person",
    size_bucket: "m",
    count: 1,
  });
});

test("SSE client IDs remain unique after disconnects", () => {
  const hub = new SseHub();
  const writes: string[] = [];
  const first = hub.add({ write: () => {}, close: () => {} });
  const second = hub.add({ write: (chunk) => writes.push(`second:${chunk}`), close: () => {} });
  hub.remove(first);
  const third = hub.add({ write: (chunk) => writes.push(`third:${chunk}`), close: () => {} });

  assert.notEqual(second, third);
  assert.ok(third > second);

  hub.sendRate({ total: 1, families: { document: 1 }, sizes: { s: 1 } }, 1);
  assert.equal(writes.length, 2);
  assert.ok(writes[0]!.startsWith("second:data:"));
  assert.ok(writes[1]!.startsWith("third:data:"));
});
