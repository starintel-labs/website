import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";
import { RadarFeed } from "./radar-feed.ts";
import { loadConfig } from "./config.ts";
import { RecentDocumentsService } from "./recent.ts";
import { SseHub } from "./sse.ts";

test("real feed pipeline sends readable records only to public clients, and revokes cached public records", { timeout: 5000 }, async (t) => {
  type Delivery = { fields: { routingKey: string }; content: Buffer };
  let deliver!: (message: Delivery | null) => void;
  let ready!: () => void;
  const connected = new Promise<void>((resolve) => { ready = resolve; });
  let acknowledged = 0;
  const channel = {
    checkExchange: async () => {}, assertQueue: async () => ({ queue: "fixture" }), bindQueue: async () => {},
    consume: async (_queue: string, callback: typeof deliver) => { deliver = callback; ready(); },
    ack: () => { acknowledged++; },
  };
  const connection = Object.assign(new EventEmitter(), { createChannel: async () => channel, close: async () => {} });
  const amqp = mock.module("amqplib", { namedExports: { connect: async () => connection } });
  t.after(() => amqp.restore());
  const cfg = { ...loadConfig({ RABBIT_URL: "amqp://fixture" }), radarFrameMs: 10 };
  const corpus = new RecentDocumentsService(cfg);
  const hubs = { public: new SseHub(), aggregate: new SseHub() };
  const publicWrites: string[] = [];
  const aggregateWrites: string[] = [];
  hubs.public.add({ write: (chunk) => { publicWrites.push(chunk); }, close: () => {} });
  hubs.aggregate.add({ write: (chunk) => { aggregateWrites.push(chunk); }, close: () => {} });
  let sawDocument!: () => void;
  let sawAggregate!: () => void;
  const documentsSeen = new Promise<void>((resolve) => { sawDocument = resolve; });
  const aggregateSeen = new Promise<void>((resolve) => { sawAggregate = resolve; });
  const feed = new RadarFeed(cfg,
    (events, scope) => hubs[scope].sendEvents(events),
    (totals, rps, scope) => { hubs[scope].sendRate(totals, rps); if (scope === "aggregate" && totals.total >= 4) sawAggregate(); },
    (documents) => { for (const doc of documents) corpus.remember(doc); hubs.public.sendDocuments(documents); sawDocument(); },
    (id) => { if (corpus.forget(id)) hubs.public.sendDocuments([], [id]); },
  );
  t.after(() => feed.stop());
  feed.start();
  await connected;
  const record = { tenant_id: "public", id: "public-post", dtype: "document", dataset: "fixture", title: "A real public record", text: "Readable document content", password: "secret-value" };
  const send = (value: unknown) => deliver({ fields: { routingKey: "documents.new.document" }, content: Buffer.from(JSON.stringify(value)) });
  send(record);
  send({ ...record, id: "private-id", tenant_id: "private", title: "private-content" });
  send({ ...record, id: "restricted-id", visibility: "private" });
  deliver({ fields: { routingKey: "actors.private-actor.private-operation" }, content: Buffer.from("not-json") });
  await Promise.all([documentsSeen, aggregateSeen]);
  const publicOutput = publicWrites.join("");
  const anonymousOutput = aggregateWrites.join("");
  assert.match(publicOutput, /event: documents/);
  assert.match(publicOutput, /Readable document content/);
  for (const forbidden of ["secret-value", "private-content", "private-id", "restricted-id", "private-actor", "private-operation"]) {
    assert.equal(publicOutput.includes(forbidden), false, forbidden);
    assert.equal(anonymousOutput.includes(forbidden), false, forbidden);
  }
  assert.equal(anonymousOutput.includes("Readable document content"), false);
  assert.equal(anonymousOutput.includes("event: documents"), false);
  assert.equal((await corpus.get(12)).documents[0]!.id, "public-post");
  send({ tenant_id: "public", id: "public-post" });
  assert.equal((await corpus.get(12)).documents[0]!.id, "public-post", "partial public activity must not revoke the last readable record");
  send({ ...record, visibility: "private" });
  assert.match(publicWrites.join(""), /"removed":\["public-post"\]/);
  assert.deepEqual((await corpus.get(12)).documents, []);
  assert.equal(acknowledged, 6);
  deliver(null);
});
