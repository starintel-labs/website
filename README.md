# website

StarIntel website applications and public web properties.

Deployment is owned by `starintel-labs/starintel-infra`.

## Design system

All apps consume **`@starintel/design`** (default theme: `obsidian-gold`).
The canonical design repository is `starintel-labs/starintel-design`; the
workspace package under `packages/design` is a vendored mirror kept in
lockstep by:

```
STARINTEL_DESIGN=../starintel-design node scripts/sync-design.mjs   # sync from canonical checkout
node scripts/sync-design.mjs --check                                # verify pin (used in CI)
```

Do not hand-edit `packages/design`; change the canonical repo and re-sync.


## StarIntel document authority

The native ingestion/public-discovery boundary consumes the immutable
`starintel_doc` JavaScript runtime generated from Star Language 0.10.1.
`packages/starintel-doc/schemas/starintel-schema.lock.json` records the source
and consumer commits and complete release hashes. Run
`node scripts/check-starintel-schema.mjs` after dependency installation.
The former Auto-Dig validator is available only through
`@starintel/starintel-doc/legacy`; its snapshot is historical compatibility.

CouchDB `_id`/`_rev` are separated from canonical `id`/`schemaVersion`;
conflicting IDs are rejected. The public feed requires both `visibility` and
`sensitivity` to be explicitly `public`, rejects deleted/restricted records,
and projects only its documented allowlist. It never includes evidence,
rawContent, provenance, or extensions. Historical documents are not silently
converted or published. This migration does not deploy or modify stored data.
