#!/usr/bin/env node
/**
 * CI hygiene checks for the StarIntel website repository.
 * Fails non-zero when invariants are violated.
 *
 *  1. .forgejo/workflows and .github/workflows both exist with at least one workflow
 *  2. authored workflows are run-only except for one exact, SHA-pinned official checkout action
 *  3. no literal secret values: tokens are referenced only via ${{ secrets.* }}
 *  4. no internal infrastructure hostnames (.star.intel) anywhere in CI config
 *  5. every workflow in BOTH systems runs the Prolog verification gate
 *     (generate-facts + pnpm "verify:ci"); Prolog is the CI verification authority
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ALLOWED_USES = new Set([
  "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
]);
let failures = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures += 1;
}

function checkWorkflowDir(label, dir, { forbidGithubUrls }) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail(`${label} workflows directory is missing`);
    return;
  }
  const workflows = readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  if (workflows.length === 0) fail(`${label} workflows directory contains no workflows`);
  for (const wf of workflows) {
    const text = readFileSync(join(dir, wf), "utf8");
    for (const match of text.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)) {
      const action = match[1];
      if (!ALLOWED_USES.has(action)) {
        fail(`${label}/${wf}: unapproved action '${action}'; only the SHA-pinned official checkout action is allowed`);
      }
    }
    if (/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/.test(text)) {
      // secrets are allowed only as references; ensure no literal assignment nearby
      const literal = /(?:token|secret|password|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i;
      if (literal.test(text.replace(/\$\{\{[^}]*\}\}/g, ""))) {
        fail(`${label}/${wf}: possible literal secret value`);
      }
    }
    if (/star\.intel/.test(text)) fail(`${label}/${wf}: internal infrastructure hostname leaked`);
    if (forbidGithubUrls && /https?:\/\/(www\.)?github\.com/i.test(text) && !/github\.com\/[^/]+\/checkout/i.test(text)) {
      // GitHub URLs in Forgejo CI config are suspicious; allow none for now
      fail(`${label}/${wf}: github.com URL in Forgejo workflow`);
    }
    if (!/generate-facts\.mjs/.test(text) || !/verify:ci/.test(text)) {
      fail(`${label}/${wf}: workflow must run the Prolog verification gate (generate-facts.mjs + pnpm "verify:ci")`);
    }
  }
}

checkWorkflowDir(".forgejo", join(root, ".forgejo", "workflows"), { forbidGithubUrls: true });
checkWorkflowDir(".github", join(root, ".github", "workflows"), { forbidGithubUrls: false });

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
