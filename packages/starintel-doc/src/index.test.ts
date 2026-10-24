import assert from "node:assert/strict";
import test from "node:test";
import { isPublicEligible, validateV09, V09ValidationError } from "./index.ts";

test("schema validator loads Ajv formats and rejects an invalid document", () => {
  assert.throws(() => validateV09({}), V09ValidationError);
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
