%% state.pl -- persisted progress for the website platform program.
%% Written and updated by the actor as tasks complete. Restartable from disk.
%% Facts:
%%   done(Task).
%%   failed(Task, Reason).
%%   note(Task, Text).

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
done(nsaspyPortfolioImplemented).
done(nsaspyDailiesImplemented).
done(autoDigBackendImplemented).
note(autoDigBackendImplemented, 'FastAPI /api/v1 in starintel-gpt-auto-dig backend/: capabilities, durable run lifecycle, idempotent mutations, progress, validated results, health/readiness; 10 tests green').
done(autoDigV09Verified).
note(autoDigV09Verified, 'backend validates every document via starintel_doc v0.9; server gate unblocked by fix/v09-false-value-pipeline (20 suites/184 tests green); palantir doc with handling.pii=false accepted and stored as boolean').
