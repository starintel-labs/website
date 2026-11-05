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

The scope selector uses `/radar/stream?scope=public` (the default) or
`?scope=aggregate`. Public activity requires the exact shared public tenant.
Legacy events without a `handling` field are public in that tenant; when
handling is present, pinned-schema validation and explicit public/safety flags
are still required. This radar-only fallback does not publish document bodies
or change the recent-documents eligibility policy.

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
