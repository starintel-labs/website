# AGENTS.md — starintel-design

Working rules for agents operating in this repository.

## Scope

This repository is the canonical StarIntel design system
(`@starintel/design`). The default and only theme is `obsidian-gold`.

## Architecture invariants

- The lowest-level contract is CSS custom properties + `.si-*` classes.
  No framework (React, Vue, Solid) may become a requirement to use the theme.
- Semantic tokens only in component CSS. Never hardcode hex values outside
  `src/css/tokens.css`.
- `theme.css` is generated from `src/css/*` by `scripts/build-css.mjs` and is
  committed. After any CSS change: run `pnpm build` and commit the bundle.
  The test suite fails on drift.
- Legacy aliases in `tokens.css` are deprecated; do not add new ones, do not
  use them in this repo's own code.
- TS modules ship as source (the StarIntel ecosystem runs Node 24 strip-types
  and Vite; neither needs a JS build). Keep imports extensioned `.ts` and the
  package `"type": "module"`.

## Verification gate

Before claiming any UI or token work is done:

1. `pnpm build && pnpm test && pnpm typecheck`
2. `pnpm showcase:build`
3. Render the showcase (or a consumer app) in a real browser and LOOK at the
   screenshots. Build success is not visual evidence.
4. Update `examples/showcase` when adding or changing components — it is the
   canonical visual reference.

## Git

- `origin` lives at `git.starintel.actor` (starintel-labs/starintel-design).
  GitHub is a fallback mirror.
- Commit in small slices: tokens, components, docs, showcase are separate
  commits.
