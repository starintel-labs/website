import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.ts";
import { validateV09, V09ValidationError } from "@starintel/starintel-doc";
import { fetchNewestPublic, RecentDocumentsService } from "./recent.ts";

test("recent timeline requests full docs without reducing the view", async () => {
  let requested: URL | undefined;
  const fetchStub = (async (input: string | URL | Request) => {
    requested = new URL(String(input));
    return new Response(JSON.stringify({ rows: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const docs = await fetchNewestPublic({ ...loadConfig({}), recentWindow: 12 }, fetchStub);
  assert.deepEqual(docs, []);
  assert.ok(requested);
  assert.equal(requested.pathname, "/starintel/_design/time/_view/timeline");
  assert.equal(requested.searchParams.get("include_docs"), "true");
  assert.equal(requested.searchParams.get("reduce"), "false");
  assert.equal(requested.searchParams.get("descending"), "true");
  assert.equal(requested.searchParams.get("limit"), "36");
});

test("invalid source rows are skipped and an empty eligible window is safe", async () => {
  const valid = {
    _id: "test-recent-valid",
    dataset: "test",
    dtype: "document",
    schema_version: "0.9.0",
    version: 1,
    date_added: "2026-10-24T00:00:00Z",
    date_updated: "2026-10-24T00:00:00Z",
    sources: [],
    evidence: [],
    data: {},
  };
  assert.doesNotThrow(() => validateV09(valid));
  assert.throws(() => validateV09({ ...valid, unexpected: true }), V09ValidationError);
  const fetchStub = (async () =>
    new Response(JSON.stringify({ rows: [
      { id: "invalid", doc: { ...valid, unexpected: true } },
      { id: "valid", doc: valid },
    ] }), { status: 200 })) as typeof fetch;
  const result = await new RecentDocumentsService(loadConfig({})).get(12, fetchStub);
  assert.deepEqual(result.documents, []);
  assert.equal(result.window, 0);
  assert.equal(result.eligible, 0);
});

test("a later schema-valid public row survives an invalid row", async () => {
  const doc = {
    _id: "test-public-recent",
    dataset: "test",
    dtype: "document",
    schema_version: "0.9.0",
    version: 1,
    date_added: "2026-10-24T00:00:00Z",
    date_updated: "2026-10-24T00:00:00Z",
    sources: [],
    evidence: [],
    data: {},
    handling: { visibility: "public", pii: false, sensitive: false },
  };
  const fetchStub = (async () =>
    new Response(JSON.stringify({ rows: [
      { id: "invalid", doc: { ...doc, tenant_id: "test" } },
      { id: doc._id, doc },
    ] }), { status: 200 })) as typeof fetch;
  const result = await new RecentDocumentsService(loadConfig({})).get(12, fetchStub);
  assert.deepEqual(result.documents.map((item) => item._id), [doc._id]);
  assert.equal(result.eligible, 1);
});
