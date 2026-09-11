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
