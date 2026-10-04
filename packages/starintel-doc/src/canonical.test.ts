import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCanonical,
  validateCanonicalLine,
  fromCouchDocument,
  isPublicEligible,
  projectPublicDocument,
  assertNoInternalDomains,
} from "./index.ts";
const document = () => ({
  id: "doc:public",
  dataset: "test",
  dtype: "document",
  schemaVersion: "0.10.1" as const,
  createdAt: 1791069478,
  visibility: "public",
  sensitivity: "public",
});
test("native flat document validates; nested and mislabeled legacy fail", () => {
  assert.deepEqual(validateCanonical(document()), document());
  for (const bad of [
    { ...document(), data: {} },
    { ...document(), _id: "old" },
    { ...document(), schemaVersion: "0.9.0" },
    { ...document(), dtype: "not-a-type" },
  ])
    assert.throws(() => validateCanonical(bad));
  assert.throws(() => validateCanonicalLine(""));
  assert.throws(() => validateCanonicalLine("{"));
});
test("dtype-specific fields and decimal boundaries are enforced", () => {
  assert.throws(() =>
    validateCanonical({
      ...document(),
      dtype: "location",
      latitude: "91.0000000",
    }),
  );
  assert.throws(() =>
    validateCanonical({ ...document(), sources: ["untyped-ref"] }),
  );
  assert.equal(
    validateCanonical({ ...document(), confidence: "0.500" }).confidence,
    "0.500",
  );
});
test("CouchDB transport keys are separate and identity conflicts rejected", () => {
  assert.deepEqual(
    fromCouchDocument({ ...document(), _id: "doc:public", _rev: "1-abc" }),
    document(),
  );
  assert.throws(() => fromCouchDocument({ ...document(), _id: "different" }));
  assert.throws(() => fromCouchDocument({ ...document(), _rev: 7 }));
  assert.throws(() =>
    fromCouchDocument({ _id: "legacy", dtype: "document", data: {} }),
  );
});
test("public projection drops all evidence, raw content and extension payloads", () => {
  const doc = validateCanonical({
    ...document(),
    rawContent: "secret payload",
    provenance: { private: true },
    extensions: { private: "secret" },
    tags: ["published"],
  });
  assert.deepEqual(projectPublicDocument(doc), {
    id: doc.id,
    dataset: doc.dataset,
    dtype: doc.dtype,
    schemaVersion: "0.10.1",
    createdAt: 1791069478,
    tags: ["published"],
  });
});
test("unknown, restricted and deleted documents fail closed", () => {
  for (const patch of [
    { visibility: "private" },
    { visibility: undefined },
    { sensitivity: "unknown" },
    { sensitivity: "restricted" },
    { deleted: true },
    { extensions: { legacyHandling: { confidential: true } } },
  ]) {
    const doc = { ...document(), ...patch };
    assert.equal(isPublicEligible(doc), false);
    assert.throws(() => projectPublicDocument(doc));
  }
});
test("repeated infrastructure leak checks remain deterministic", () => {
  const host = ["private", "star", "intel"].join(".");
  assert.throws(() => assertNoInternalDomains(host));
  assert.throws(() => assertNoInternalDomains(host));
  assert.doesNotThrow(() => assertNoInternalDomains("public description"));
});
