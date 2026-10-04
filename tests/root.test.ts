/** Root-level integration tests: publisher CLI contract, content parsing, hygiene. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOrgDate } from "@starintel/content";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function script(
  name: string,
  args: string[],
): { stdout: string; status: number } {
  const r = spawnSync("node", [join(root, "scripts", name), ...args], {
    encoding: "utf8",
    cwd: root,
  });
  return { stdout: r.stdout ?? "", status: r.status ?? 1 };
}

test("publish --list enumerates configured targets", () => {
  const { stdout, status } = script("publish.mjs", ["--list"]);
  assert.equal(status, 0);
  for (const target of ["blog", "research", "nsaspy"]) {
    assert.match(stdout, new RegExp(target));
  }
});

test("publish rejects unknown targets", () => {
  const { status } = script("publish.mjs", ["nonexistent-target"]);
  assert.equal(status, 2);
});

test("parseOrgDate handles org timestamp forms", () => {
  assert.equal(parseOrgDate("[2026-08-28 Fri]"), "2026-08-28");
  assert.equal(parseOrgDate("<2026-08-28 Wed>"), "2026-08-28");
  assert.equal(parseOrgDate("2026-08-28T10:00:00Z"), "2026-08-28");
  assert.equal(parseOrgDate("undated"), null);
  assert.equal(parseOrgDate(null), null);
});

test("canonical schema pin check passes", () => {
  const { status } = script("check-starintel-schema.mjs", []);
  assert.equal(status, 0);
});

test("ci hygiene passes", () => {
  const { status } = script("ci-hygiene.mjs", []);
  assert.equal(status, 0);
});

test("public projection requires explicit public visibility and sensitivity", async () => {
  const { isPublicEligible } = await import("@starintel/starintel-doc");
  assert.equal(
    isPublicEligible({ visibility: "public", sensitivity: "public" }),
    true,
  );
  assert.equal(
    isPublicEligible({ visibility: "public", sensitivity: "restricted" }),
    false,
  );
  assert.equal(isPublicEligible({ visibility: "public" }), false);
  assert.equal(
    isPublicEligible({ visibility: "private", sensitivity: "public" }),
    false,
  );
  assert.equal(
    isPublicEligible({
      visibility: "public",
      sensitivity: "public",
      extensions: { handling: { restricted: true } },
    }),
    false,
  );
});
