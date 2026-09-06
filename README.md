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
