#!/usr/bin/env node
/**
 * Fail closed if the vendored StarIntel 0.10.1 schema artifacts drift from
 * the exact canonical release head recorded in the local lock.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaDir = join(root, "packages", "starintel-doc", "schemas");
const lock = JSON.parse(
  readFileSync(join(schemaDir, "starintel-schema-v0.10.1.lock.json"), "utf8"),
);

const expected = {
  schema_version: "0.10.1",
  release_version: "0.10.1",
  profile_version: "0.10.1",
  schema_revision: "0.10.1+fields.20260919.1",
  dtype_count: 58,
  canonical_repository: "lost-rob0t/starintel-gpt-auto-dig",
  canonical_commit: "cb258634bf413b9f3620c229dfd821270e8d5377",
  canonical_pull_request: 2737,
  schema_blob_sha: "60d63a048191d292e825a33c7a2901341e42dcf8",
  manifest_blob_sha: "75446d40c77ff1d29ee2006b72a7b520b33a46ac",
  emitted_schema_version: "0.10.1",
};

function die(message) {
  console.error("StarIntel 0.10.1 schema lock failure: " + message);
  process.exit(1);
}

function blobSha(path) {
  const result = spawnSync("git", ["hash-object", path], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) die("cannot hash " + path);
  return result.stdout.trim();
}

for (const [key, value] of Object.entries(expected)) {
  if (lock[key] !== value) {
    die("lock " + key + "=" + JSON.stringify(lock[key]) + "; expected " + JSON.stringify(value));
  }
}

const schemaPath = join(schemaDir, "starintel-doc-v0.10.1.schema.json");
const manifestPath = join(schemaDir, "starintel-doc-v0.10.1.manifest.json");
if (blobSha(schemaPath) !== lock.schema_blob_sha) die("vendored schema blob SHA drifted");
if (blobSha(manifestPath) !== lock.manifest_blob_sha) die("vendored manifest blob SHA drifted");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const key of ["schema_version", "release_version", "profile_version", "schema_revision", "dtype_count"]) {
  if (manifest[key] !== lock[key]) {
    die("manifest " + key + "=" + JSON.stringify(manifest[key]) + "; expected " + JSON.stringify(lock[key]));
  }
}
if (manifest.migration?.emitted_schema_version !== "0.10.1") {
  die("manifest emitted_schema_version is not 0.10.1");
}

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const dtypes = new Set(
  (schema.allOf ?? [])
    .map((branch) => branch?.if?.properties?.dtype?.const)
    .filter((dtype) => typeof dtype === "string"),
);
if (dtypes.size !== lock.dtype_count) die("schema dtype count drifted");
for (const dtype of ["event", "wireless-network", "wireless-station", "pcap-capture", "operation"]) {
  if (!dtypes.has(dtype)) die("schema is missing required dtype " + dtype);
}

console.log("StarIntel 0.10.1 artifacts match canonical PR #2737 head " + lock.canonical_commit);
