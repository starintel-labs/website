import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PUBLIC_RECORD_BYTES, parseRecord, projectPublicRecord, publicUrl } from "./public-documents.ts";
import { isPublicDocument } from "../shared/public-document.ts";
const internalHost = ["service", "star", "intel"].join(".");

test("renders both current flat and legacy public records without relabelling wire documents", () => {
  const current = { tenant_id: "public", id: "person-1", dataset: "fixture", dtype: "person", schemaVersion: "0.10.1", fname: "Ada", lname: "Lovelace", visibility: "public", sensitivity: "public", createdAt: 1793836800 };
  assert.equal(projectPublicRecord(current, "public")?.title, "Ada Lovelace");
  const legacy = { tenant_id: "public", _id: "post-1", dataset: "fixture", dtype: "social-media-post", data: { text: "A public observation", username: "observer", platform: "example" } };
  const projected = projectPublicRecord(legacy, "public");
  assert.equal(projected?.title, "observer");
  assert.equal(projected?.summary, "A public observation");
  assert.equal(legacy.data.text, "A public observation");
  assert.equal(projectPublicRecord({ ...legacy, summary: "", description: null, title: null }, "public")?.summary, "A public observation");
  assert.equal(projectPublicRecord({ ...legacy, title: "Understanding multi-tenant software" }, "public")?.title, "Understanding multi-tenant software");
});

test("public display projection drops unknown, raw, contact, credential and tenant metadata", () => {
  const projected = projectPublicRecord({
    tenant_id: "public", _id: "public-1", dataset: "fixture", dtype: "user", data: {
      username: "observer", password: "secret-password", email: "nonpublic@example.invalid", ssn: "private-id",
      raw: { token: "secret-token" }, extensions: { anything: "private-extension" }, unexpected: "private-unknown",
    }, metadata: { token: "private-metadata" }, summary: `${internalHost} is internal`,
  }, "public");
  assert.ok(projected);
  const json = JSON.stringify(projected);
  for (const forbidden of ["tenant", "secret-", "nonpublic", "private-", internalHost, "password", "ssn"]) assert.equal(json.includes(forbidden), false, forbidden);
  assert.equal(projected.summary, "[redacted] is internal");
});

test("private or explicitly restricted records never render", () => {
  const base = { tenant_id: "public", id: "public-1", dataset: "fixture", dtype: "document", title: "Record" };
  for (const changes of [
    { tenant_id: "private" }, { tenantId: "private" }, { visibility: "private" }, { sensitivity: "restricted" },
    { deleted: true }, { _deleted: true }, { pii: true }, { sensitive: true }, { accessControl: {} }, { handling: null }, { handling: { visibility: "public", pii: true, sensitive: false } },
  ]) assert.equal(projectPublicRecord({ ...base, ...changes }, "public"), null);
  assert.equal(projectPublicRecord({ tenant_id: "public" }, "public"), null);
});

test("source links reject active content, internal addresses, credentials and signed secrets", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "https://user:password@example.com", "http://127.0.0.1/a", "http://[::1]/a", "https://host.local/a", `https://${internalHost}/a`, "https://example.com/?token=private"]) assert.equal(publicUrl(url), undefined, url);
  assert.equal(publicUrl("https://example.org/public"), "https://example.org/public");
});

test("projection and parsing remain bounded with hostile content", () => {
  assert.equal(parseRecord(Buffer.alloc(MAX_PUBLIC_RECORD_BYTES + 1)), null);
  for (const value of ["null", "[]", "false", "broken"]) assert.equal(parseRecord(Buffer.from(value)), null);
  const document = projectPublicRecord({ tenant_id: "public", id: "doc", dataset: "fixture", dtype: "document", title: "x".repeat(10000), text: "<script>alert(1)</script>".repeat(10000) }, "public")!;
  assert.equal(document.title.length, 300);
  assert.equal(document.summary!.length, 12000);
});

test("source URL allowlisting also applies to provenance lists and title fallbacks", () => {
  const doc = projectPublicRecord({ tenant_id: "public", id: "link", dtype: "url", dataset: "fixture", url: "https://example.org/?token=secret-value", sourceUrls: ["javascript:alert(1)", "https://example.org/public", "https://example.org/public"] }, "public")!;
  assert.equal(doc.url, undefined);
  assert.equal(doc.title.includes("secret-value"), false);
  assert.deepEqual(doc.sourceUrls, ["https://example.org/public"]);
});

test("client presentation contract rejects expanded or malformed records before rendering", () => {
  const doc = projectPublicRecord({ tenant_id: "public", id: "doc", dtype: "document", dataset: "fixture", title: "Record" }, "public")!;
  assert.equal(isPublicDocument(doc), true);
  for (const invalid of [null, [], {}, { ...doc, raw: { secret: "private" } }, { ...doc, fields: null }, { ...doc, fields: [{ label: "Name", value: "Record", secret: "private" }] }, { ...doc, title: null }]) assert.equal(isPublicDocument(invalid), false);
});
