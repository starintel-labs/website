# website

StarIntel website applications and public web properties.

> NOTE: This repository will be the main `starintel.actor` website. `apps/main`
> (`@starintel/main`) is the canonical site for the `starintel.actor` apex
> domain; the other apps (blog, nsaspy, admin, symbolics) are public properties
> served under it.

Deployment is owned by `starintel-labs/starintel-infra`.

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
