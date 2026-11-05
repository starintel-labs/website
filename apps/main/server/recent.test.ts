import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.ts";
import { fetchNewestPublic, RecentDocumentsService } from "./recent.ts";
import { projectPublicRecord } from "./public-documents.ts";

const stored = { tenant_id: "public", _id: "post-1", dataset: "fixture", dtype: "social-media-post", data: { username: "observer", text: "Public observation" } };
const response = (documents: unknown[]) => new Response(JSON.stringify({ rows: documents.map((doc) => ({ doc })) }));
const projected = (id: string) => projectPublicRecord({ ...stored, _id: id }, "public")!;

test("snapshot uses a small, newest-first, full-document, non-reduced query", async () => {
  let requested: URL | undefined;
  const fetchStub = (async (input: string | URL | Request) => {
    requested = new URL(String(input));
    return response([]);
  }) as typeof fetch;
  assert.deepEqual(await fetchNewestPublic({ ...loadConfig({}), recentWindow: 12 }, fetchStub), []);
  assert.equal(requested!.pathname, "/starintel/_design/time/_view/timeline");
  for (const [key, value] of Object.entries({ include_docs: "true", reduce: "false", descending: "true", limit: "12" })) assert.equal(requested!.searchParams.get(key), value);
});

test("homepage and radar share legacy/current public eligibility and projected content", async () => {
  const current = { tenant_id: "public", id: "person-1", dataset: "fixture", dtype: "person", schemaVersion: "0.10.1", fname: "Ada", lname: "Lovelace", visibility: "public", sensitivity: "public" };
  const fetchStub = (async () => response([null, {}, stored, current, { ...stored, _id: "private", tenant_id: "private" }, { ...stored, _id: "restricted", visibility: "private" }])) as typeof fetch;
  const result = await new RecentDocumentsService(loadConfig({})).get(12, fetchStub);
  assert.deepEqual(result.documents.map((doc) => doc.id), ["post-1", "person-1"]);
  assert.equal(result.documents[0]!.summary, "Public observation");
  assert.equal(result.documents[1]!.title, "Ada Lovelace");
  assert.equal(result.stale, false);
  assert.equal(stored.tenant_id, "public");
  assert.equal(JSON.stringify(result).includes("tenant"), false);
});

test("snapshot rejects conflicting tenant aliases and private/sensitive legacy handling", async () => {
  for (const changes of [
    { tenantId: "private" }, { tenant_id: "Private" }, { handling: { visibility: "private" } },
    { handling: { visibility: "public", pii: true, sensitive: false } }, { sensitivity: "secret" }, { deleted: true },
  ]) {
    const fetchStub = (async () => response([{ ...stored, ...changes }])) as typeof fetch;
    assert.deepEqual(await fetchNewestPublic(loadConfig({}), fetchStub), []);
  }
});

test("live public documents immediately serve the homepage without querying CouchDB", async () => {
  const service = new RecentDocumentsService({ ...loadConfig({}), recentWindow: 2 });
  for (const id of ["one", "two", "three", "two"]) service.remember(projected(id));
  const fetchStub = (async () => { throw new Error("must not query source"); }) as typeof fetch;
  const result = await service.get(12, fetchStub);
  assert.deepEqual(result.documents.map((doc) => doc.id), ["two", "three"]);
  assert.equal(result.source, "live");
  assert.equal(result.window, 2);
  assert.equal(service.forget("two"), true);
  assert.deepEqual((await service.get(12, fetchStub)).documents.map((doc) => doc.id), ["three"]);
  assert.equal(service.forget("never-public"), false);
});

test("a revocation invalidates an older in-flight source snapshot", async () => {
  const service = new RecentDocumentsService(loadConfig({}));
  let resolve!: (value: Response) => void;
  const pending = service.get(12, (async () => new Promise<Response>((done) => { resolve = done; })) as typeof fetch);
  service.forget("post-1");
  resolve(response([stored]));
  assert.deepEqual((await pending).documents, []);
});

test("a cold homepage request need not wait for a slow snapshot once a live public record arrives", { timeout: 1000 }, async () => {
  const service = new RecentDocumentsService(loadConfig({}));
  let finish!: (value: Response) => void;
  const pending = service.get(12, (async () => new Promise<Response>((resolve) => { finish = resolve; })) as typeof fetch);
  service.remember(projected("live-1"));
  const result = await pending;
  assert.equal(result.documents[0]!.id, "live-1");
  assert.equal(result.source, "live");
  finish(response([stored]));
});

test("concurrent cold requests share one source query", async () => {
  const service = new RecentDocumentsService(loadConfig({}));
  let calls = 0;
  const fetchStub = (async () => { calls++; return response([stored]); }) as typeof fetch;
  const results = await Promise.all([service.get(12, fetchStub), service.get(12, fetchStub)]);
  assert.equal(calls, 1);
  assert.equal(results[0]!.documents[0]!.id, "post-1");
});

test("transient source failure returns a labelled bounded cache instead of erasing documents", async () => {
  const original = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const service = new RecentDocumentsService({ ...loadConfig({}), recentCacheMs: 10 });
    await service.get(12, (async () => response([stored])) as typeof fetch);
    now += 100;
    let calls = 0;
    const fail = (async () => { calls++; throw new Error("source timeout"); }) as typeof fetch;
    const cached = await service.get(12, fail);
    assert.equal(cached.documents[0]!.id, "post-1");
    assert.equal(cached.stale, true);
    assert.equal(cached.source, "cache");
    await service.get(12, fail);
    assert.equal(calls, 1, "failed source queries are backed off");
    now += 300_001;
    await assert.rejects(service.get(12, fail), /timeout/);
  } finally { Date.now = original; }
});

test("unavailable source without a safe cache remains an honest error", async () => {
  const service = new RecentDocumentsService(loadConfig({}));
  await assert.rejects(service.get(12, (async () => new Response("unavailable", { status: 503 })) as typeof fetch), /503/);
});

test("source responses are byte-bounded and malformed rows fail closed", async () => {
  await assert.rejects(fetchNewestPublic(loadConfig({}), (async () => new Response(" ".repeat(8 * 1024 * 1024 + 1))) as typeof fetch), /exceeds limit/);
  await assert.rejects(fetchNewestPublic(loadConfig({}), (async () => new Response('{"rows":{}}')) as typeof fetch), /invalid timeline/);
});
