import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.ts";
import { projectDelivery, projectAggregateDelivery, RadarAggregator } from "./projector.ts";
import { isPublicRadarDelivery } from "./radar-feed.ts";
import { SseHub } from "./sse.ts";
import type { Person } from "../../../schema/starintel/0.10.1/generated/starintel_types.ts";

test("radar defaults to the StarIntel documents exchange", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.rabbitExchange, "documents");
  assert.equal(cfg.publicTenantId, "public");
  assert.throws(() => loadConfig({ PUBLIC_TENANT_ID: "private-tenant" }), /invalid PUBLIC_TENANT_ID/);
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

test("radar honors explicit legacy handling in the shared public tenant", () => {
  const doc = {
    _id: "test-public-radar", dataset: "public", dtype: "document",
    schema_version: "0.9.0", version: 1,
    date_added: "2026-10-24T00:00:00Z", date_updated: "2026-10-24T00:00:00Z",
    sources: [], evidence: [], data: {},
  };
  const body = (tenant_id: unknown, handling: unknown) => Buffer.from(JSON.stringify({ ...doc, tenant_id, handling }));
  const safe = { visibility: "public", pii: false, sensitive: false };
  assert.equal(isPublicRadarDelivery(body("public", safe), "public"), true);
  assert.equal(isPublicRadarDelivery(body("private", safe), "public"), false);
  assert.equal(isPublicRadarDelivery(body("public", { ...safe, pii: true }), "public"), false);
  assert.equal(isPublicRadarDelivery(body("public", { ...safe, visibility: "private" }), "public"), false);
  assert.equal(isPublicRadarDelivery(Buffer.from("not json"), "public"), false);
  assert.equal(isPublicRadarDelivery(Buffer.from("[]"), "public"), false);
  assert.equal(isPublicRadarDelivery(Buffer.from(JSON.stringify({ tenant_id: "public", handling: safe })), "public"), true);
});

test("current StarLang flat documents use visibility and sensitivity, not the legacy v0.9 envelope", () => {
  // org.starintel/core@1, specs/starintel/0.10.1/core.star at 010873f8e4462b5c705a21206d8cee55e5c5b2e0.
  const doc = {
    tenant_id: "public", id: "person-current", dataset: "fixture", dtype: "person",
    schemaVersion: "0.10.1", fname: "Ada", lname: "Lovelace",
    visibility: "public", sensitivity: "public",
  } satisfies Person & { tenant_id: string };
  const eligible = (changes: Record<string, unknown>) => isPublicRadarDelivery(Buffer.from(JSON.stringify({ ...doc, ...changes })), "public");
  assert.equal(eligible({}), true);
  for (const visibility of ["private", "shared", "inherited", "unknown", null, false]) {
    assert.equal(eligible({ visibility }), false);
  }
  for (const sensitivity of ["internal", "confidential", "restricted", "secret", "unknown", null]) {
    assert.equal(eligible({ sensitivity }), false);
  }
  assert.equal(eligible({ deleted: true }), false);
  assert.equal(eligible({ accessControl: { readers: ["private-user"] } }), false);
  assert.equal(eligible({ tenantId: "private" }), false);
  assert.equal(eligible({ handling: { visibility: "private" } }), false);
  assert.equal(eligible({ tenant_id: "private" }), false);
});

test("legacy events in the exact public tenant do not require modern document fields or handling", () => {
  for (const doc of [
    { tenant_id: "public" },
    { tenant_id: "public", dtype: "user", schema_version: "0.8.0", username: "legacy-user" },
    { tenant_id: "public", event: "actor-completed" },
  ]) {
    assert.equal(isPublicRadarDelivery(Buffer.from(JSON.stringify(doc)), "public"), true);
  }
  for (const tenant_id of [undefined, null, "private", "Public", "public ", ["public"]]) {
    assert.equal(isPublicRadarDelivery(Buffer.from(JSON.stringify({ tenant_id })), "public"), false);
  }
  for (const doc of [null, [], "public", 1, { tenantId: "public" }, { tenant: "public" }]) {
    assert.equal(isPublicRadarDelivery(Buffer.from(JSON.stringify(doc)), "public"), false);
  }
});

test("legacy public-tenant fallback never overrides explicit or malformed handling", () => {
  for (const handling of [
    null, false, "public", [], {},
    { visibility: "private" },
    { visibility: "public", pii: true },
    { visibility: "public", sensitive: true },
    { visibility: "public", pii: false, sensitive: false, classification: "secret" },
    { visibility: "public", pii: false, sensitive: false, embargo_until: "2099-01-01T00:00:00Z" },
  ]) {
    assert.equal(isPublicRadarDelivery(Buffer.from(JSON.stringify({ tenant_id: "public", handling })), "public"), false);
  }
});

test("all-traffic projection cannot expose arbitrary routing text or document types", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  for (const key of ["documents.new.private-customer", "actors.private-customer.secret-action", "private.internal.host"]) {
    const event = projectAggregateDelivery(key, 4096, now);
    assert.equal(event.t, now.toISOString());
    assert.equal(event.size_bucket, "m");
    assert.equal(event.count, 1);
    assert.equal("dtype" in event, false);
    assert.equal(JSON.stringify(event).includes("private"), false);
    assert.equal(JSON.stringify(event).includes("secret"), false);
    assert.deepEqual(Object.keys(event).sort(), ["count", "family", "kind", "size_bucket", "t"]);
  }
});

test("scope aggregators keep independent counts and publish idle rate updates", () => {
  const publicFrames: { events: unknown[]; total: number; rate: number }[] = [];
  const aggregateFrames: { events: unknown[]; total: number }[] = [];
  const publicAggregator = new RadarAggregator(250, (events, totals) => {
    publicFrames.push({ events, total: totals.total, rate: publicAggregator.currentRate() });
  });
  const aggregate = new RadarAggregator(250, (events, totals) => aggregateFrames.push({ events, total: totals.total }));
  publicAggregator.add(projectDelivery("documents.new.user", 10)!);
  aggregate.add(projectAggregateDelivery("documents.new.user", 10));
  aggregate.add(projectAggregateDelivery("documents.new.private-customer", 10));
  publicAggregator.flush();
  aggregate.flush();
  assert.equal(publicFrames[0]!.total, 1);
  assert.equal(aggregateFrames[0]!.total, 2);
  assert.equal(aggregateFrames[0]!.events.length, 1);
  const now = Date.now;
  try {
    Date.now = () => now() + 11_000;
    publicAggregator.flush();
  } finally {
    Date.now = now;
  }
  assert.deepEqual(publicFrames[1], { events: [], total: 1, rate: 0 });
});

test("radar does not forward tenant metadata from routing keys", () => {
  for (const key of ["actors.tenant_id", "actors.Tenant_ID", "actors.tenantId", "actors.tenant_ids", "actors.tenantIds", "actors.tenant-ids", "actors.tenant", "documents.new.tenantid"]) {
    const event = projectDelivery(key, 10);
    assert.ok(event);
    assert.equal(JSON.stringify(event).toLowerCase().includes("tenant"), false);
  }
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

test("SSE serializer removes tenant metadata from nested event objects", () => {
  const hub = new SseHub();
  const writes: string[] = [];
  hub.add({ write: (chunk) => writes.push(chunk), close: () => {} });
  const event = { ...projectDelivery("actors.radar-probe", 10)!, tenant_id: "private-tenant", nested: { tenantId: "private-alias", tenant_ids: ["private-list"], tenant: { id: "private-object" }, description: "tenant_id=private-tenant" } };
  hub.sendEvents([event]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.includes("tenant"), false);
  assert.equal(writes[0]!.includes("private-tenant"), false);
  assert.equal(event.tenant_id, "private-tenant");
});
