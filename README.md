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
The old package-local v0.9 lock belongs to historical validation helpers and
their conformance tests, not the current wire authority. Public display supports
both stored legacy records and current flat records without relabelling either.

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

`/radar` is a searchable public-document feed with a selected-record reader,
source links, type filters, pause/resume, and a separate anonymous telemetry
scope. Its appearance follows the existing obsidian/gold design system.

The runtime needs:

- `RABBIT_URL` — AMQP URL with read access to the StarIntel broker.
- `RABBIT_EXCHANGE` — optional; defaults to the canonical `documents` topic exchange.
- `RADAR_FRAME_MS` — optional batching interval; defaults to `250` ms.

When `RABBIT_URL` is unset, radar stays in standby and `/readyz` reports `radar: "off"`.
With a valid broker URL it binds `documents.new.#`, `documents.ingest.#`,
`documents.updated.#`, and `actors.#`; the projector exposes only its small
allowlisted schema, and `/readyz` reports `radar: "live"` once connected.

The scope selector uses `/radar/stream?scope=public` (the default) or
`?scope=aggregate`. Public activity requires the exact shared public tenant.
Legacy events without a `handling` field are public in that tenant; when
handling is present, explicit public/safety flags are still required. Current
StarLang flat documents are supported without requiring the historical v0.9
envelope: top-level `visibility` and `sensitivity` must be public when present;
deletions, explicit access controls, and ambiguous tenant aliases are excluded.
The same disclosure gate and explicit presentation-field allowlist now serve
Radar and `/api/recent-documents`. Named `documents` SSE frames contain bounded
public display projections, never complete RabbitMQ bodies, raw/data maps,
arbitrary extensions, tenant metadata, or credential/contact fields. Flat
current records and nested legacy display fields share one implementation.
Known public records that become restricted or deleted are removed from the
live window; older in-flight snapshots cannot reintroduce them. The reader
inserts all content as text, not HTML, and source links accept public HTTP(S)
URLs only, excluding credential-bearing or signed URLs.

The backend retains at most `RECENT_WINDOW` (1–100, default 100) public records;
the browser retains 100. Public document frames batch at most 32 records per
tick and slow SSE clients are disconnected before unbounded buffering. A live
record can satisfy a waiting homepage request without waiting for CouchDB.
Fallback snapshots fetch at most 50 rows with an 8 MiB response bound and a
ten-second deadline, replacing the old 300-full-document/five-second query.
Transient failures may serve a clearly labelled cache for at most five minutes;
an unavailable source without a safe cache remains HTTP 503 with a retry action.

All-traffic aggregates count every delivery on the subscribed routes, including
private or malformed bodies, but expose only fixed event categories, timestamps,
coarse payload-size buckets, and counts. They omit document types, identifiers,
tenant details, and arbitrary routing-key text. The scopes have independent
totals; idle rate updates return to zero after the rolling ten-second window.

### Browser regression

After `pnpm build:main`, run `uv run --with playwright python tests/radar-browser.py`
(or run that Python script in an environment with Playwright). Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing Chromium executable when
needed. The test covers document rendering, filtering, bounded pause/resume,
revocation, anonymous-scope isolation, HTML injection, homepage retry/cache
states, and desktop/mobile screenshots. Fixtures are local test records only.

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
