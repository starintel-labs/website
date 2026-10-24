# @starintel/design

Canonical StarIntel design system. Default theme: **obsidian-gold** —
an obsidian-black canvas, structural gold, ivory text. Symbolic-computing
aesthetics: lambda marks, typed document graphs, engineering-workstation
density. Framework-independent by contract.

## Consumption

The lowest-level contract is CSS custom properties and `.si-*` classes.
No framework is required.

```html
<html data-si-theme="obsidian-gold">
  <link rel="stylesheet" href="node_modules/@starintel/design/theme.css" />
```

or, in a bundler:

```js
import "@starintel/design/theme.css";
```

Granular sources are exported individually:

```js
import "@starintel/design/css/tokens.css";
import "@starintel/design/css/base.css";
import "@starintel/design/css/layout.css";
import "@starintel/design/css/components.css";
import "@starintel/design/css/org.css";   // org-export typography
import "@starintel/design/css/motion.css";
```

Framework-free DOM helpers (wordmark, cards, chips, topbar, footer) are
optional conveniences:

```js
import { renderWordmark, card, chip } from "@starintel/design";
```

## Assets

Lambda / symbolic-graph identity graphics live in `assets/` and are exported
via `@starintel/design/assets/*`:

`starintel-mark.svg`, `lambda-mark.svg`, `lambda-network.svg`,
`lambda-grid.svg`, `node-field.svg`, `graph-grid.svg`, `relation-path.svg`.

## Development

```
pnpm install
pnpm build        # regenerate theme.css from src/css parts
pnpm test         # token contract + package hygiene + brand tests
pnpm typecheck
pnpm showcase     # run the visual showcase app
```

`theme.css` is committed; `pnpm build` regenerates it and the test suite
fails when the bundle drifts from `src/css/*`.

## Consumers

- `starintel-labs/website` (starintel.actor) — vendored mirror under
  `packages/design`, kept in lockstep by `scripts/sync-design.mjs`.
- Quasar and future StarIntel surfaces consume the package directly.

The design mandate for agents lives in [docs/AGENT-DESIGN-GUIDE.md](docs/AGENT-DESIGN-GUIDE.md).
