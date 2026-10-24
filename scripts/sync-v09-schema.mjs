#!/usr/bin/env node
/**
 * Sync the vendored StarIntel v0.9 wire schema from the exact canonical
 * StarIntel release recorded in packages/starintel-doc/schemas/starintel-schema.lock.json.
 *
 *   node scripts/sync-v09-schema.mjs           # copy exact locked artifacts
 *   node scripts/sync-v09-schema.mjs --check   # fail closed on any drift
 *
 * STARINTEL_AUTO_DIG may point at a canonical checkout. When present, its
 * Git HEAD MUST equal the locked canonical commit before it can be trusted.
 */
import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaDir = join(root, "packages", "starintel-doc", "schemas");
const lockPath = join(schemaDir, "starintel-schema.lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const check = process.argv.includes("--check");

const expectedLock = {
  schema_version: "0.9.0",
  release_version: "0.9.1",
  profile_version: "0.9.1",
  schema_revision: "0.9.0+fields.20260909.1",
  dtype_count: 51,
  canonical_repository: "lost-rob0t/starintel-gpt-auto-dig",
  canonical_commit: "6479c0a9dc88ce9fed183515fc4df5d245de0b3a",
  canonical_pull_request: 2416,
  schema_path: "schemas/starintel-doc-v0.9.0.schema.json",
  manifest_path: "schemas/starintel-doc-v0.9.0.manifest.json",
};

function die(message) {
  console.error(`StarIntel schema lock failure: ${message}`);
  process.exit(1);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sameBytes(a, b) {
  return readFileSync(a).equals(readFileSync(b));
}

for (const [key, value] of Object.entries(expectedLock)) {
  if (lock[key] !== value) {
    die(`lock ${key}=${JSON.stringify(lock[key])}; expected ${JSON.stringify(value)}`);
  }
}
for (const dtype of ["research-node", "operation"]) {
  if (!Array.isArray(lock.required_dtypes) || !lock.required_dtypes.includes(dtype)) {
    die(`lock required_dtypes is missing ${dtype}`);
  }
}

const vendoredSchema = join(schemaDir, basename(lock.schema_path));
const vendoredManifest = join(schemaDir, basename(lock.manifest_path));
const schemaPin = `${vendoredSchema}.sha256`;

function verifyVendored() {
  for (const path of [vendoredSchema, vendoredManifest, schemaPin]) {
    if (!existsSync(path)) die(`missing vendored artifact ${path}`);
  }

  const pinnedHash = readFileSync(schemaPin, "utf8").trim();
  const actualHash = sha256(vendoredSchema);
  if (actualHash !== pinnedHash) {
    die(`vendored schema hash ${actualHash} does not match ${pinnedHash}`);
  }

  const manifest = JSON.parse(readFileSync(vendoredManifest, "utf8"));
  for (const key of [
    "schema_version",
    "release_version",
    "profile_version",
    "schema_revision",
    "dtype_count",
  ]) {
    if (manifest[key] !== lock[key]) {
      die(`manifest ${key}=${JSON.stringify(manifest[key])}; expected ${JSON.stringify(lock[key])}`);
    }
  }

  const schema = JSON.parse(readFileSync(vendoredSchema, "utf8"));
  const dtypes = new Set(
    (schema.allOf ?? [])
      .map((branch) => branch?.if?.properties?.dtype?.const)
      .filter((dtype) => typeof dtype === "string"),
  );
  if (dtypes.size !== lock.dtype_count) {
    die(`vendored schema has ${dtypes.size} dtypes; expected ${lock.dtype_count}`);
  }
  for (const dtype of lock.required_dtypes) {
    if (!dtypes.has(dtype)) die(`vendored schema is missing required dtype ${dtype}`);
  }
}

const autoDig = process.env.STARINTEL_AUTO_DIG ?? join(root, "..", "starintel-gpt-auto-dig");
const canonicalSchema = join(autoDig, lock.schema_path);
const canonicalManifest = join(autoDig, lock.manifest_path);
const canonicalAvailable = existsSync(canonicalSchema) && existsSync(canonicalManifest);

function verifyCanonicalCheckout() {
  if (!canonicalAvailable) return false;
  const rev = spawnSync("git", ["-C", autoDig, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (rev.status !== 0) die(`cannot identify canonical checkout HEAD at ${autoDig}`);
  const head = rev.stdout.trim();
  if (head !== lock.canonical_commit) {
    die(`canonical checkout HEAD ${head} is not locked commit ${lock.canonical_commit}`);
  }
  return true;
}

if (check) {
  verifyVendored();
  if (verifyCanonicalCheckout()) {
    if (!sameBytes(canonicalSchema, vendoredSchema)) {
      die("vendored schema differs byte-for-byte from locked canonical schema");
    }
    if (!sameBytes(canonicalManifest, vendoredManifest)) {
      die("vendored manifest differs byte-for-byte from locked canonical manifest");
    }
    console.log(`StarIntel 0.9.1 artifacts match canonical ${lock.canonical_commit}`);
  } else {
    console.log(
      `StarIntel 0.9.1 local lock/hash/manifest checks pass for canonical ${lock.canonical_commit}`,
    );
  }
} else {
  if (!verifyCanonicalCheckout()) {
    die(`canonical checkout unavailable at ${autoDig}; refusing an unverified sync`);
  }
  copyFileSync(canonicalSchema, vendoredSchema);
  copyFileSync(canonicalManifest, vendoredManifest);
  writeFileSync(schemaPin, `${sha256(vendoredSchema)}\n`);
  verifyVendored();
  console.log(`synced exact StarIntel 0.9.1 canonical artifacts from ${lock.canonical_commit}`);
}
