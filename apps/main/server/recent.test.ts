import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchNewestPublic, RecentDocumentsService } from "./recent.ts";
import { loadConfig } from "./config.ts";

const config = () =>
  loadConfig({ COUCHDB_URL: "http://127.0.0.1:5984", COUCHDB_DB: "documents" });
const doc = (id: string) => ({
  id,
  _id: id,
  _rev: "1-abc",
  dataset: "test",
  dtype: "document",
  schemaVersion: "0.10.1",
  sensitivity: "public",
  visibility: "public",
  rawContent: "private raw body",
});
const respond = (documents: unknown[]) =>
  (async () =>
    new Response(
      JSON.stringify({ rows: documents.map((doc) => ({ doc })) }),
    )) as typeof fetch;

test("recent feed validates canonical rows and never publishes raw payload", async () => {
  const value = await new RecentDocumentsService(config()).get(
    12,
    respond([doc("one"), { ...doc("two"), visibility: "private" }]),
  );
  assert.equal(value.eligible, 1);
  assert.deepEqual(value.documents, [
    { id: "one", dataset: "test", dtype: "document", schemaVersion: "0.10.1" },
  ]);
});
test("legacy rows and Couch identity collisions never become public", async () => {
  await assert.rejects(
    fetchNewestPublic(
      config(),
      respond([
        {
          _id: "legacy",
          dtype: "document",
          schema_version: "0.9.0",
          handling: { public: true },
          data: {},
        },
      ]),
    ),
  );
  await assert.rejects(
    fetchNewestPublic(config(), respond([{ ...doc("one"), _id: "two" }])),
  );
});
test("restricted data fails closed despite public visibility", async () => {
  assert.deepEqual(
    await fetchNewestPublic(
      config(),
      respond([
        { ...doc("secret"), sensitivity: "restricted" },
        { ...doc("unknown"), sensitivity: "unknown" },
        { ...doc("gone"), deleted: true },
      ]),
    ),
    [],
  );
});
