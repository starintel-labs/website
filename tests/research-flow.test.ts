import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../apps/main/server/config.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("research page connects public archive and OIDC admin plane", () => {
  const html = readFileSync(join(root, "apps", "main", "research.html"), "utf8");
  assert.match(html, /auto-research\.starintel\.actor/);
  assert.match(html, /admin\.starintel\.actor/);
  assert.match(html, /src="\/src\/research\.ts"/);
  const client = readFileSync(join(root, "apps", "main", "src", "research.ts"), "utf8");
  assert.match(client, /\/api\/research\/status/);
});

test("Auto Research upstream is explicit and optional", () => {
  assert.equal(loadConfig({}).autoResearchUrl, null);
  assert.equal(
    loadConfig({ AUTO_RESEARCH_URL: "http://127.0.0.1:9010" }).autoResearchUrl,
    "http://127.0.0.1:9010",
  );
});
