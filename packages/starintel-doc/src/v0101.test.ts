import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STARINTEL_V0101_SCHEMA_VERSION,
  V0101ValidationError,
  validateV0101,
} from "./index.ts";

function eventDoc(): Record<string, unknown> {
  return {
    _id: "wardrive-run:test",
    dataset: "starintel-wardrive",
    dtype: "event",
    schema_version: "0.10.1",
    version: 1,
    date_added: "2026-10-02T04:00:00.000Z",
    date_updated: "2026-10-02T04:00:00.000Z",
    sources: [],
    evidence: [],
    data: {
      event_kind: "wireless-survey-run",
      name: "Wireless survey run",
      status: "completed",
    },
    extensions: {
      "starintel.wardrive": {
        profile: "srr/0.2",
      },
    },
  };
}

test("v0.10.1 validator accepts a current event envelope", () => {
  const doc = validateV0101(eventDoc());
  assert.equal(doc.schema_version, STARINTEL_V0101_SCHEMA_VERSION);
  assert.equal(doc.dtype, "event");
});

test("v0.10.1 validator rejects legacy emission", () => {
  const doc = eventDoc();
  doc.schema_version = "0.9.0";
  assert.throws(() => validateV0101(doc), V0101ValidationError);
});

test("v0.10.1 validator rejects unknown event data fields", () => {
  const doc = eventDoc();
  (doc.data as Record<string, unknown>).not_in_schema = true;
  assert.throws(() => validateV0101(doc), V0101ValidationError);
});
