#!/usr/bin/env node
/** Verify every installed generated artifact against the immutable authority release. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgPath = join(root, "packages/starintel-doc/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const lock = JSON.parse(
  readFileSync(
    join(root, "packages/starintel-doc/schemas/starintel-schema.lock.json"),
    "utf8",
  ),
);
const expected = `github:${lock.consumer_repository}#${lock.consumer_commit}`;
if (pkg.dependencies.starintel_doc !== expected)
  throw new Error("canonical consumer pin drift");
if (
  lock.authority_repository !== "lost-rob0t/star-lang" ||
  lock.release.schemaVersion !== "0.10.1"
)
  throw new Error("canonical authority drift");
const require = createRequire(pkgPath);
const installed = join(
  dirname(require.resolve("starintel_doc")),
  "../schemas/starintel-0.10.1",
);
const release = JSON.parse(
  readFileSync(join(installed, "release-lock.json"), "utf8"),
);
if (JSON.stringify(release) !== JSON.stringify(lock.release))
  throw new Error("installed release lock drift");
for (const [group, prefix] of [
  ["sources", ""],
  ["artifacts", "generated/"],
]) {
  for (const [name, hash] of Object.entries(lock.release[group])) {
    const actual = createHash("sha256")
      .update(readFileSync(join(installed, prefix + name)))
      .digest("hex");
    if (actual !== hash) throw new Error(`canonical artifact drift: ${name}`);
  }
}
console.log("StarLang 0.10.1 complete release closure verified");
