import assert from "node:assert/strict";
import test from "node:test";
import { isPublicEligible, projectPublicDocument, serializePublicJson, validateV09, V09ValidationError } from "./index.ts";

test("schema validator loads Ajv formats and rejects an invalid document", () => {
  assert.throws(() => validateV09({}), V09ValidationError);
});

test("public projection and JSON serialization exclude tenant metadata without mutation", () => {
  const input = {
    _id: "test", dtype: "document", dataset: "test",
    date_added: "2026-10-24T00:00:00Z", date_updated: "2026-10-24T00:00:00Z",
    tenant_id: "private-tenant",
    nested: { tenantId: "private-alias", Tenant_ID: "private-case", "tenant-id": "private-hyphen", tenantid: "private-compact", tenant_ids: ["private-list"], tenantIds: ["private-camel-list"], "tenant-ids": ["private-hyphen-list"], tenant: { id: "private-object" }, keep: true },
  };
  const projected = projectPublicDocument(input);
  assert.equal(Object.hasOwn(projected, "tenant_id"), false);
  assert.deepEqual(JSON.parse(serializePublicJson(input)), {
    _id: "test", dtype: "document", dataset: "test",
    date_added: "2026-10-24T00:00:00Z", date_updated: "2026-10-24T00:00:00Z",
    nested: { keep: true },
  });
  assert.equal(input.tenant_id, "private-tenant");
  assert.equal(input.nested.Tenant_ID, "private-case");
});

test("public JSON redacts entire strings containing tenant metadata tokens", () => {
  const input = { title: "tenant_id=private-tenant", summary: "Tenants have policies", tags: ["tenantIds: private-alias"] };
  assert.deepEqual(JSON.parse(serializePublicJson(input)), {
    title: "[redacted]", summary: "Tenants have policies", tags: ["[redacted]"],
  });
  assert.equal(input.title, "tenant_id=private-tenant");
});

test("public eligibility requires canonical handling fields", () => {
  const doc = {
    _id: "test-public",
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
  assert.equal(isPublicEligible(validateV09(doc)), true);
  assert.equal(isPublicEligible({ ...doc, handling: { ...doc.handling, visibility: "private" } }), false);
  assert.equal(isPublicEligible({ ...doc, handling: { ...doc.handling, pii: true } }), false);
  assert.equal(isPublicEligible({ ...doc, handling: { ...doc.handling, sensitive: true } }), false);
  assert.equal(isPublicEligible({ ...doc, handling: { ...doc.handling, classification: "restricted" } }), false);
  assert.equal(isPublicEligible({ ...doc, handling: { ...doc.handling, embargo_until: "2027-01-01T00:00:00Z" } }), false);
  assert.equal(isPublicEligible({ ...doc, handling: { public: true } }), false);
});
