# website

StarIntel website applications and public web properties.

> NOTE: This repository will be the main `starintel.actor` website. `apps/main`
> (`@starintel/main`) is the canonical site for the `starintel.actor` apex
> domain; the other apps (blog, nsaspy, admin, symbolics) are public properties
> served under it.

Deployment is owned by `starintel-labs/starintel-infra`.

## StarIntel authority pin

`schema/starintel-schema.lock.json` pins the active StarLang release and its
complete generated consumer bundle, including the canonical compatibility reader.
The sync tool is copied byte-for-byte from the same immutable authority commit.
The old package-local v0.9 lock is retained only for the legacy recent-documents
API; it is not the current wire authority and records are never silently relabelled.

```sh
pnpm spec:update                       # resolve upstream main once; verify and pin
pnpm spec:update --commit <full-SHA>   # reproducible explicit repin
pnpm spec:check                        # offline hashes and complete closure
pnpm spec:check:upstream               # compare every byte with immutable upstream
```

For a local authority checkout, append `--source /path/to/star-lang`. The updater
reads committed objects, never dirty working files, and is a no-op when the
upstream release/tool bytes have not changed. No manual lock edits or schema
generation are needed. Unsupported releases and hash drift fail closed.

Forgejo's **StarIntel pin update** workflow runs daily or on manual dispatch:
update → full CI → one bot PR. Configure repository secret
`STARINTEL_PIN_UPDATE_TOKEN` with repository-content and pull-request write access.
It never auto-merges or deploys unreviewed changes. Regular CI checks both the
offline bundle and the exact upstream commit; deployment consumes the tested pin.

## Radar configuration

`/radar` consumes the public-safe projection of RabbitMQ routing metadata only;
message bodies are never forwarded to browsers.

The runtime needs:

- `RABBIT_URL` — AMQP URL with read access to the StarIntel broker.
- `RABBIT_EXCHANGE` — optional; defaults to the canonical `documents` topic exchange.
- `RADAR_FRAME_MS` — optional batching interval; defaults to `250` ms.

When `RABBIT_URL` is unset, radar stays in standby and `/readyz` reports `radar: "off"`.
With a valid broker URL it binds `documents.new.#`, `documents.ingest.#`,
`documents.updated.#`, and `actors.#`; the projector exposes only its small
allowlisted metadata schema, and `/readyz` reports `radar: "live"` once connected.

The scope selector uses `/radar/stream?scope=public` (the default) or
`?scope=aggregate`. Public activity requires the exact shared public tenant.
Legacy events without a `handling` field are public in that tenant; when
handling is present, explicit public/safety flags are still required. Current
StarLang flat documents are supported without requiring the historical v0.9
envelope: top-level `visibility` and `sensitivity` must be public when present;
deletions, explicit access controls, and ambiguous tenant aliases are excluded.
Radar validates disclosure metadata, not the document's application payload.
This radar-only policy never publishes document bodies or changes the separate
legacy recent-documents validator or its schema lock.

All-traffic aggregates count every delivery on the subscribed routes, including
private or malformed bodies, but expose only fixed event categories, timestamps,
coarse payload-size buckets, and counts. They omit document types, identifiers,
tenant details, and arbitrary routing-key text. The scopes have independent
totals; idle rate updates return to zero after the rolling ten-second window.

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
