#!/usr/bin/env node
/**
 * Sync the vendored StarIntel v0.9 schema from the canonical repo.
 *
 *   node scripts/sync-v09-schema.mjs           # copy canonical -> vendored
 *   node scripts/sync-v09-schema.mjs --check   # exit 1 if vendored copy drifts
 *
 * Canonical source: ../starintel-gpt-auto-dig/schemas/starintel-doc-v0.9.0.schema.json
 * (override with STARINTEL_AUTO_DIG env var).
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const autoDig = process.env.STARINTEL_AUTO_DIG ?? join(root, "..", "starintel-gpt-auto-dig");
const canonical = join(autoDig, "schemas", "starintel-doc-v0.9.0.schema.json");
const vendored = join(root, "packages", "starintel-doc", "schemas", "starintel-doc-v0.9.0.schema.json");

const check = process.argv.includes("--check");

function sha(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

if (check) {
  if (sha(canonical) !== sha(vendored)) {
    console.error(`v0.9 schema drift: vendored copy differs from ${canonical}`);
    console.error("run: node scripts/sync-v09-schema.mjs");
    process.exit(1);
  }
  console.log("v0.9 schema in sync");
} else {
  copyFileSync(canonical, vendored);
  writeFileSync(vendored + ".sha256", sha(vendored) + "\n");
  console.log(`synced ${canonical} -> ${vendored}`);
}
