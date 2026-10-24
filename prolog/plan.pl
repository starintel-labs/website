%% plan.pl -- StarIntel website platform task knowledge base.
%% Static task definitions and dependency edges. Progress lives in state.pl.
%%
%% Program: bootstrap the StarIntel web platform (website.starintel.actor).

:- module(plan, [
    task/2,
    depends/2,
    verificationRequired/2
]).

%% task(Name, Description)
task(websiteRepositoryCreated,   'starintel-labs/website repository exists with monorepo scaffold').
task(sharedUiImplemented,        'Shared StarIntel design system package with Symbolics identity').
task(symbolicsMainSiteImplemented,'Main site leads with Symbolic AI, hand-designed').
task(wwwAliasConfigured,         'www.starintel.actor canonicalizes to starintel.actor in the main app').
task(recentDocumentsImplemented, 'Newest-100 eligible public documents discovery component').
task(radarImplemented,           '/radar live activity view behind a public-safe projector').
task(orgPublishingPipeline,      'Org source -> exporter -> manifests -> configurable output repo').
task(outputRepositoryConfigurable,'publish.toml targets with CLI/env overrides, dry-run, diff').
task(openCodeHarnessImplemented, 'OpenCode enrichment harness with provenance').
task(blogOrgPipelineImplemented, 'blog.starintel.actor from social-presence Org').
task(researchOrgPipelineImplemented,'Approval-gated research publishing from auto-research Org').
task(nsaspyResumeImplemented,    'nsaspy resume from Org').
task(nsaspyPortfolioImplemented, 'nsaspy portfolio from Org').
task(nsaspyDailiesImplemented,   'nsaspy dailies feed from Org').
task(autoDigBackendImplemented,  'Typed versioned Auto Dig backend API').
task(autoDigV09Verified,         'Auto Dig documents verify against StarIntel v0.9').
task(autoDigImporterImplemented, 'Fast streaming v0.9 importer with checkpoints').
task(autoDigImporterBenchmarked, 'Importer benchmarked against a real StarIntel server').
task(forgejoCiImplemented,       'Forgejo Actions workflows for website and touched repos').
task(githubCiMirrorsProlog,      'GitHub Actions mirror workflows run the same Prolog verification').
task(prologVerificationPassing,  'verify.pl passes all invariants, exits non-zero on failure').
task(websiteVerified,            'Website build, tests, and verification green').

%% depends(Task, Prerequisite)
depends(sharedUiImplemented, websiteRepositoryCreated).
depends(symbolicsMainSiteImplemented, sharedUiImplemented).
depends(wwwAliasConfigured, symbolicsMainSiteImplemented).
depends(recentDocumentsImplemented, symbolicsMainSiteImplemented).
depends(radarImplemented, symbolicsMainSiteImplemented).
depends(outputRepositoryConfigurable, websiteRepositoryCreated).
depends(orgPublishingPipeline, sharedUiImplemented).
depends(orgPublishingPipeline, outputRepositoryConfigurable).
depends(blogOrgPipelineImplemented, orgPublishingPipeline).
depends(researchOrgPipelineImplemented, orgPublishingPipeline).
depends(nsaspyResumeImplemented, orgPublishingPipeline).
depends(nsaspyPortfolioImplemented, orgPublishingPipeline).
depends(nsaspyDailiesImplemented, orgPublishingPipeline).
depends(openCodeHarnessImplemented, orgPublishingPipeline).
depends(autoDigV09Verified, autoDigBackendImplemented).
depends(autoDigImporterImplemented, autoDigV09Verified).
depends(autoDigImporterBenchmarked, autoDigImporterImplemented).
depends(forgejoCiImplemented, websiteRepositoryCreated).
depends(githubCiMirrorsProlog, forgejoCiImplemented).
depends(websiteVerified, symbolicsMainSiteImplemented).
depends(websiteVerified, blogOrgPipelineImplemented).
depends(websiteVerified, researchOrgPipelineImplemented).
depends(websiteVerified, nsaspyResumeImplemented).
depends(websiteVerified, nsaspyPortfolioImplemented).
depends(websiteVerified, nsaspyDailiesImplemented).
depends(websiteVerified, recentDocumentsImplemented).
depends(websiteVerified, radarImplemented).
depends(websiteVerified, githubCiMirrorsProlog).
depends(prologVerificationPassing, websiteVerified).

%% verificationRequired(Task, Check)
verificationRequired(symbolicsMainSiteImplemented, buildMainSite).
verificationRequired(recentDocumentsImplemented, recentDocsProjectionAllowlisted).
verificationRequired(radarImplemented, radarSchemaAllowlisted).
verificationRequired(blogOrgPipelineImplemented, blogProvenancePresent).
verificationRequired(researchOrgPipelineImplemented, researchApprovalGated).
verificationRequired(nsaspyDailiesImplemented, dailyDateMatchesUrl).
verificationRequired(autoDigV09Verified, v09SchemaValidation).
verificationRequired(autoDigImporterImplemented, importerResultCategories).
verificationRequired(forgejoCiImplemented, forgejoWorkflowsExist).
verificationRequired(githubCiMirrorsProlog, githubWorkflowsRunProlog).
verificationRequired(prologVerificationPassing, verifyPlExitCode).
