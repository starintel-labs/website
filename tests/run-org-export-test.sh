#!/usr/bin/env bash
# Org export pipeline test: exports the fixture through the real Emacs
# exporter and asserts the artifacts, stable anchors, and metadata.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

emacs --batch -Q --load "$root/tools/orgexport/export.el" -- \
  "$out" "$root/tests/fixtures/org/sample-post.org" > "$out/log" 2>&1 || {
  cat "$out/log"; exit 1; }

test -f "$out/test-actors-prolog.html"
test -f "$out/test-actors-prolog.meta.json"

grep -q '<h2 id="first-section"' "$out/test-actors-prolog.html"
grep -q '<h3 id="subsection-here"' "$out/test-actors-prolog.html"
grep -q 'org-function-name\|org-string' "$out/test-actors-prolog.html"

node -e '
const meta = require(process.argv[1]);
const assert = require("node:assert");
assert.equal(meta.slug, "test-actors-prolog");
assert.equal(meta.title, "Test Post: Actors & Prolog");
assert.equal(meta.author, "nsaspy");
assert.ok(meta.anchors.includes("first-section"));
assert.ok(meta.anchors.includes("second-section"));
' "$out/test-actors-prolog.meta.json"

echo "org-export test: ok"
