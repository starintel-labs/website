#!/usr/bin/env node
/**
 * enrich.mjs -- optional OpenCode enrichment pass over generated manifests.
 *
 * Deterministic core, LLM suggestions optional:
 *   1. computes the manifest sha256 (provenance anchor)
 *   2. runs the `enrich` OpenCode subagent in proposal-only mode
 *   3. validates proposals into content/_enrichment/<target>/ with provenance
 *   4. never mutates the published content tree; website builds consume
 *      proposals only when their source hash matches the current manifest
 *
 *   node scripts/enrich.mjs blog [--dry-run]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!target) {
  console.error("usage: enrich.mjs <target> [--dry-run]");
  process.exit(2);
}

const manifestPath = join(root, "content", target, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`no manifest for target ${target}; run scripts/publish.mjs ${target} first`);
  process.exit(2);
}
const manifest = readFileSync(manifestPath, "utf8");
const manifestHash = createHash("sha256").update(manifest).digest("hex");
const parsed = JSON.parse(manifest);

if (dryRun) {
  console.log(JSON.stringify({ target, count: parsed.documents.length, manifest_sha256: manifestHash }));
  process.exit(0);
}

const prompt = [
  `Target: ${target}`,
  `Manifest sha256: ${manifestHash}`,
  `Documents: ${parsed.documents.map((d) => d.slug).join(", ")}`,
  "",
  "Propose enrichment for each document: excerpt (<=200 chars, from the source text only),",
  "tags (from the document text only), related slugs (only between documents in this manifest),",
  "social-card copy (<=125 chars). Output ONLY a JSON object:",
  '{"target": "...", "manifest_sha256": "...", "documents": [{"slug": "...", "excerpt": "...", "tags": [], "related": [], "card": "..."}]}',
].join("\n");

const run = spawnSync("opencode", ["run", "--agent", "enrich", prompt], {
  cwd: root,
  encoding: "utf8",
  timeout: 600_000,
  env: { ...process.env, OPENCODE_CONFIG: join(root, "opencode.jsonc") },
});
if (run.status !== 0) {
  console.error(`opencode enrichment failed (exit ${run.status})`);
  if (run.stderr) console.error(run.stderr.slice(0, 2000));
  process.exit(1);
}

// Extract the JSON object from the response.
const out = run.stdout ?? "";
const start = out.indexOf("{");
const end = out.lastIndexOf("}");
if (start === -1 || end === -1) {
  console.error("enrichment output contained no JSON object; nothing written");
  process.exit(1);
}
let proposals;
try {
  proposals = JSON.parse(out.slice(start, end + 1));
} catch {
  console.error("enrichment output was not valid JSON; nothing written");
  process.exit(1);
}

if (proposals.manifest_sha256 !== manifestHash) {
  console.error("enrichment provenance mismatch: proposal manifest hash does not match current manifest");
  process.exit(1);
}

const outDir = join(root, "content", "_enrichment", target);
mkdirSync(outDir, { recursive: true });
const written = [];
for (const doc of proposals.documents ?? []) {
  const slug = String(doc.slug ?? "");
  if (!/^[a-z0-9/-]+$/.test(slug) || !parsed.documents.some((d) => d.slug === slug)) {
    continue; // fail closed: only known slugs
  }
  const record = {
    slug,
    source_manifest_sha256: manifestHash,
    generated_by: "opencode:enrich",
    generated_at: new Date().toISOString(),
    proposals: {
      excerpt: typeof doc.excerpt === "string" ? doc.excerpt.slice(0, 240) : undefined,
      tags: Array.isArray(doc.tags) ? doc.tags.filter((t) => typeof t === "string").slice(0, 8) : undefined,
      related: Array.isArray(doc.related) ? doc.related.filter((r) => parsed.documents.some((d) => d.slug === r)) : undefined,
      card: typeof doc.card === "string" ? doc.card.slice(0, 125) : undefined,
    },
  };
  writeFileSync(join(outDir, `${slug.replaceAll("/", "_")}.json`), JSON.stringify(record, null, 2) + "\n");
  written.push(slug);
}
console.log(`enrichment: ${written.length} proposal file(s) -> ${outDir}`);
