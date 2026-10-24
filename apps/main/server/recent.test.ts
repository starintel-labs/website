import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.ts";
import { fetchNewestPublic } from "./recent.ts";

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
