#!/usr/bin/env node
/**
 * Sync the vendored @starintel/design package from the canonical repo.
 *
 *   node scripts/sync-design.mjs           # copy canonical -> vendored
 *   node scripts/sync-design.mjs --check   # exit 1 when vendored copy drifts
 *
 * Canonical source: ../starintel-design (override with STARINTEL_DESIGN env var).
 * Vendored copy: packages/design (workspace package, exact payload of the
 * canonical repo minus development-only directories).
 *
 * When the canonical checkout is unavailable (CI), --check verifies the
 * vendored tree against the pinned hash in packages/design/.upstream.sha256.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const canonical = process.env.STARINTEL_DESIGN ?? join(root, "..", "starintel-design");
const vendored = join(root, "packages", "design");
const pin = join(vendored, ".upstream.sha256");

const check = process.argv.includes("--check");

// Payload directories/files mirrored from the canonical repo.
const PAYLOAD = ["package.json", "src", "theme.css", "assets", "README.md", "AGENTS.md"];

function treeHash(dir) {
  const entries = [];
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(full);
      } else if (entry.name !== ".upstream.sha256" && entry.name !== "UPSTREAM.json") {
        entries.push({ rel: relative(dir, full), sha: createHash("sha256").update(readFileSync(full)).digest("hex") });
      }
    }
  }
  walk(dir);
  const digest = createHash("sha256");
  for (const e of entries) digest.update(`${e.rel}:${e.sha}\n`);
  return digest.digest("hex");
}

function upstreamCommit() {
  const head = join(canonical, ".git", "HEAD");
  if (!existsSync(head)) return "unknown";
  const text = readFileSync(head, "utf8").trim();
  const refPath = text.startsWith("ref:")
    ? join(canonical, ".git", text.slice(4).trim())
    : null;
  return refPath && existsSync(refPath) ? readFileSync(refPath, "utf8").trim() : text;
}

if (check) {
  if (existsSync(join(canonical, "package.json"))) {
    const current = treeHash(vendored);
    // Compare payload trees: canonical payload must hash to the same value.
    const tmp = join(root, "var", "sync-design-compare");
    rmSync(tmp, { recursive: true, force: true });
    for (const p of PAYLOAD) {
      if (existsSync(join(canonical, p))) {
        cpSync(join(canonical, p), join(tmp, p), { recursive: true });
      }
    }
    writeFileSync(join(tmp, ".upstream.sha256"), readFileSync(pin, "utf8"));
    const canonicalHash = treeHash(tmp);
    rmSync(tmp, { recursive: true, force: true });
    if (canonicalHash !== current) {
      console.error("@starintel/design drift: vendored copy differs from canonical source");
      console.error("run: node scripts/sync-design.mjs");
      process.exit(1);
    }
    console.log("@starintel/design in sync with canonical source");
  } else {
    // Canonical repo not checked out (e.g. CI): verify against the pinned hash.
    if (!existsSync(pin)) {
      console.error("@starintel/design pin file missing and canonical repo unavailable");
      process.exit(1);
    }
    const current = treeHash(vendored);
    if (current !== readFileSync(pin, "utf8").trim()) {
      console.error("@starintel/design vendored copy does not match pinned hash");
      process.exit(1);
    }
    console.log("@starintel/design matches pinned hash (canonical repo unavailable)");
  }
} else {
  if (!existsSync(join(canonical, "package.json"))) {
    console.error(`canonical starintel-design checkout not found at ${canonical}`);
    process.exit(1);
  }
  rmSync(vendored, { recursive: true, force: true });
  for (const p of PAYLOAD) {
    if (existsSync(join(canonical, p))) {
      cpSync(join(canonical, p), join(vendored, p), { recursive: true });
    }
  }
  // The vendored copy ships source only: neutralize lifecycle scripts that
  // depend on development-only directories (scripts/, tests/, tsconfig).
  const pkgPath = join(vendored, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.scripts = { build: "true", test: "true", lint: "true", typecheck: "true" };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  writeFileSync(
    join(vendored, "UPSTREAM.json"),
    JSON.stringify(
      { repo: "starintel-labs/starintel-design", commit: upstreamCommit(), synced_at: new Date().toISOString() },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(pin, treeHash(vendored) + "\n");
  console.log(`synced ${canonical} -> ${vendored} @ ${upstreamCommit().slice(0, 12)}`);
}
