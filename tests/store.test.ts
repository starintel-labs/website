import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const main = join(root, "apps", "main");

function read(path: string): string {
  return readFileSync(join(main, path), "utf8");
}

test("store is an explicit Vite MPA entry", () => {
  const config = read("vite.config.ts");
  assert.match(config, /store:\s*resolve\(__dirname,\s*"store\.html"\)/);
});

test("store keeps source, support, and dataset rights separated", () => {
  const html = read("store.html");
  assert.match(html, /Private Source License/);
  assert.match(html, /\$5,000/);
  assert.match(html, /3 years of source updates included/);
  assert.match(html, /support not included/i);
  assert.match(html, /Public accessibility alone does not\s+establish resale rights/i);
  assert.match(html, /Preview catalog/i);
});

test("store does not claim checkout is already live", () => {
  const html = read("store.html");
  assert.match(html, /checkout and fulfillment activate only after/i);
  assert.match(html, /store wiring in progress/i);
  assert.match(html, /crypto checkout planned/i);
});
