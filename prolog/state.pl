%% state.pl -- persisted progress for the website platform program.
%% Written and updated by the actor as tasks complete. Restartable from disk.
%% Facts:
%%   done(Task).
%%   failed(Task, Reason).
%%   note(Task, Text).

:- module(state, [done/1, failed/2, note/2]).

:- dynamic(failed/2).
:- discontiguous(done/1).
:- discontiguous(note/2).

done(websiteRepositoryCreated).
note(websiteRepositoryCreated, 'starintel-labs/website existed with 2 commits; monorepo scaffold added on agent/website-bootstrap').
done(sharedUiImplemented).
note(sharedUiImplemented, 'packages/ui: tokens/base/layout/org css, symbolics wordmark, components').
done(symbolicsMainSiteImplemented).
note(symbolicsMainSiteImplemented, 'apps/main landing leads with Symbolic AI; hand-designed; builds clean').
done(wwwAliasConfigured).
note(wwwAliasConfigured, 'server canonicalizes www.starintel.actor -> starintel.actor via 301; smoke tested').
done(orgPublishingPipeline).
note(orgPublishingPipeline, 'tools/orgexport + scripts/publish.mjs; provenance-enriched manifests; blog+nsaspy published').
done(outputRepositoryConfigurable).
note(outputRepositoryConfigurable, 'publish.toml targets; --output-repo CLI/env override; --dry-run/--diff; refuses unconfigured repos').
done(recentDocumentsImplemented).
note(recentDocumentsImplemented, 'apps/main/server/recent.ts: newest-100 public window, random sample, allowlisted projection, 60s cache').
done(radarImplemented).
note(radarImplemented, 'apps/main radar SSE + sweep viz; projector allowlist fails closed; aggregator preserves counts').
done(nsaspyResumeImplemented).
note(nsaspyResumeImplemented, 'resume.org authored in social-presence; published + rendered at /resume/ with print styles').
done(nsaspyPortfolioImplemented).
note(nsaspyPortfolioImplemented, 'projects/{starintel,prolog-rlm}.org published; portfolio index generated').
done(nsaspyDailiesImplemented).
note(nsaspyDailiesImplemented, 'daily/2026-08-28.org published; dailies feed with YYYY/MM grouping, prev/next, static backlinks').
done(autoDigBackendImplemented).
note(autoDigBackendImplemented, 'FastAPI /api/v1 in starintel-gpt-auto-dig backend/: capabilities, durable run lifecycle, idempotent mutations, progress, validated results, health/readiness; 10 tests green').
done(autoDigV09Verified).
note(autoDigV09Verified, 'backend validates every document via starintel_doc v0.9; server gate unblocked by fix/v09-false-value-pipeline (20 suites/184 tests green); palantir doc with handling.pii=false accepted and stored as boolean').
done(autoDigImporterImplemented).
note(autoDigImporterImplemented, 'scripts/import_starintel.py: streaming NDJSON, bounded workers, checkpoints/resume, per-document categories; 9 unit tests green').
done(autoDigImporterBenchmarked).
note(autoDigImporterBenchmarked, 'real server benchmark: 5,671 docs, 730.9 docs/s inline (batch 10), 912.8 docs/s async-job mode (batch 200); 0 invalid/failed/transient; artifacts in starintel-gpt-auto-dig/reports/import-benchmarks/').
done(forgejoCiImplemented).
note(forgejoCiImplemented, '.forgejo/workflows/ci.yml in website + auto-dig + social-presence; website workflow executed end-to-end locally via act (checkout->system deps->pnpm->build->tests->typecheck->schema pin->org export->prolog facts->prolog verify->hygiene, all green); forgejo-side execution pending runner registration (infra-owned)').
done(githubCiMirrorsProlog).
note(githubCiMirrorsProlog, '.github/workflows/ci.yml mirrors the Forgejo workflow (self-contained, no uses: steps) and runs the same Prolog gate (generate-facts.mjs + verify:ci); operator preference supersedes the earlier GitHub-Actions-absent stance; ci-hygiene.mjs and verify.pl now hold BOTH systems to the Prolog verification contract').
done(prologVerificationPassing).
note(prologVerificationPassing, 'verify.pl: 18 tree-derived invariants via run.pl; verify:ci green (repo invariants); full verify gates on program_complete; non-zero exit on failure').
done(websiteVerified).
note(websiteVerified, 'all 8 workspace packages build, test, typecheck; sites render with provenance; CI workflow green end-to-end locally').
done(openCodeHarnessImplemented).
note(openCodeHarnessImplemented, 'opencode.jsonc enrich subagent (proposal-only) + scripts/enrich.mjs: manifest-hash provenance, fail-closed slug validation, never touches published content').
done(blogOrgPipelineImplemented).
note(blogOrgPipelineImplemented, 'blog.starintel.actor built from social-presence Org: launch post exported with stable anchors, provenance manifest, RSS, sitemap, article JSON-LD').
done(researchOrgPipelineImplemented).
note(researchOrgPipelineImplemented, 'approval-gated publisher (approval APPROVED + explicit allowlist, fail closed) + renderer with in-renderer gate; /research/ ships empty by default until operator allowlists IDs').
