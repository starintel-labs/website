#!/usr/bin/env node
/**
 * CI hygiene checks for the StarIntel website repository.
 * Fails non-zero when invariants are violated.
 *
 *  1. no .github/workflows directory (no GitHub Actions in this repository)
 *  2. .forgejo/workflows exists with at least one workflow
 *  3. authored Forgejo workflows contain no `uses:` steps (self-contained)
 *  4. no literal secret values: tokens are referenced only via ${{ secrets.* }}
 *  5. no internal infrastructure hostnames (.star.intel) anywhere in CI config
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures += 1;
}

const ghDir = join(root, ".github", "workflows");
if (existsSync(ghDir) && readdirSync(ghDir).length > 0) {
  fail(".github/workflows must not exist (GitHub Actions forbidden)");
}

const fjDir = join(root, ".forgejo", "workflows");
if (!existsSync(fjDir) || !statSync(fjDir).isDirectory()) {
  fail(".forgejo/workflows is missing");
} else {
  const workflows = readdirSync(fjDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  if (workflows.length === 0) fail(".forgejo/workflows contains no workflows");
  for (const wf of workflows) {
    const text = readFileSync(join(fjDir, wf), "utf8");
    if (/^\s*uses:/m.test(text)) fail(`${wf}: 'uses:' step found; workflows must be self-contained (run: only)`);
    if (/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/.test(text)) {
      // secrets are allowed only as references; ensure no literal assignment nearby
      const literal = /(?:token|secret|password|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i;
      if (literal.test(text.replace(/\$\{\{[^}]*\}\}/g, ""))) {
        fail(`${wf}: possible literal secret value`);
      }
    }
    if (/star\.intel/.test(text)) fail(`${wf}: internal infrastructure hostname leaked`);
    if (/https?:\/\/(www\.)?github\.com/i.test(text) && !/github\.com\/[^/]+\/checkout/i.test(text)) {
      // GitHub URLs in CI config are suspicious; allow none for now
      fail(`${wf}: github.com URL in Forgejo workflow`);
    }
  }
}

// Public tree must not leak internal hostnames in website sources either.
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      yield* walk(full);
    } else if (/\.(html|css|js|mjs|ts|toml|json|md|org)$/.test(entry.name)) {
      yield full;
    }
  }
}
for (const file of walk(join(root, "apps"))) {
  if (readFileSync(file, "utf8").match(/[a-z0-9-]+\.star\.intel\b/)) fail(`internal hostname leak: ${file}`);
}
for (const file of walk(join(root, "packages"))) {
  if (readFileSync(file, "utf8").match(/[a-z0-9-]+\.star\.intel\b/)) fail(`internal hostname leak: ${file}`);
}

if (failures > 0) {
  console.error(`ci-hygiene: ${failures} failure(s)`);
  process.exit(1);
}
console.log("ci-hygiene: ok");
