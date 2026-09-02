# website

StarIntel website applications and public web properties.

Deployment is owned by `starintel-labs/starintel-infra`.

## Services

- `services/auto-research` — authenticated Python control API plus a Prolog-RLM direct-mode GLM harness. It seeds Forgejo issues per project and exposes capability-gated run-workspace file tools. Symbolic execution is intentionally disabled in the initial slice.
