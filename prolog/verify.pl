%% verify.pl -- invariant verification for the StarIntel website program.
%%
%% Every check derives from generated_facts.pl (produced by
%% scripts/generate-facts.mjs from the actual tree). Final verification
%% halts non-zero on any failure.

:- module(verify, [verify_steps/1, verify_all/0, verify_ci/0]).

:- use_module(plan).

:- dynamic(failure/2).
:- dynamic(passed/1).


%% ---- check engine ----

check(Name, Goal) :-
    (   call(Goal) ->
        assertz(passed(Name)),
        format('PASS  ~w~n', [Name])
    ;   assertz(failure(Name, Goal)),
        format('FAIL  ~w~n', [Name])
    ).

%% ---- invariants ----

%% Forgejo and GitHub Actions are both CI surfaces, and both run the
%% Prolog verification gate: Prolog is the CI verification authority.
inv_ci_systems_present :-
    facts:ci_workflow(forgejo, _),
    facts:ci_workflow(github, _).

inv_ci_workflows_self_contained :-
    forall(facts:ci_workflow(S, W), facts:ci_workflow_self_contained(S, W, true)).

inv_ci_secrets_not_embedded :-
    forall(facts:ci_workflow(S, W), facts:ci_workflow_secrets_ok(S, W, true)).

inv_no_internal_hosts_in_ci :-
    forall(facts:ci_workflow(S, W), facts:ci_workflow_no_internal_hosts(S, W, true)).

inv_ci_runs_prolog :-
    forall(facts:ci_workflow(S, W), facts:ci_workflow_runs_prolog(S, W, true)).

%% www aliases apex (canonicalization lives in the main app server).
inv_www_aliases_apex :-
    facts:www_canonicalization_present(true).

%% docs.starintel.actor stays deferred.
inv_docs_deferred :-
    facts:docs_app_present(false),
    facts:docs_deploy_in_ci(false).

%% Every published document carries full provenance.
inv_published_docs_have_provenance :-
    forall(facts:published_doc(T, S), facts:doc_provenance_ok(T, S, true)).

%% Research publication is approval-gated.
inv_research_approval_gated :-
    forall(facts:published_doc(research, S), facts:research_approval_ok(S, true)).

%% Dailies: URL date (slug) matches the document date.
inv_daily_dates_match :-
    forall(facts:daily_doc(S), daily_date_consistent(S)).

daily_date_consistent(S) :-
    facts:daily_date(S, Date),
    Date == S.

%% Radar: allowlisted aggregate schema only, fail closed, no payload forwarding.
inv_radar_safe :-
    facts:radar_projector_present(true),
    facts:radar_fails_closed(true),
    facts:radar_no_payload_forwarding(true).

%% StarIntel v0.9 validation authority is pinned and complete.
inv_v09_pinned :-
    facts:v09_required_fields_complete(true),
    facts:v09_schema_pinned(true).

%% Auto Dig tooling exists (checked when the sibling checkout is available;
%% an isolated CI checkout of this repository skips it - the tooling is
%% gated by the auto-dig repository's own Forgejo CI).
inv_auto_dig_tooling :-
    facts:autodig_backend_present(true),
    facts:importer_present(true).
inv_auto_dig_tooling :-
    facts:autodig_backend_present(false),
    facts:importer_present(false).

%% OpenCode harness present (proposals only, provenance-anchored).
inv_opencode_harness :-
    facts:opencode_harness_present(true).

%% Publishing configuration: explicit targets, configurable output repo.
inv_publishing_config :-
    facts:publish_targets_configured(true),
    facts:output_repo_configurable(true).

%% No internal infrastructure hostnames anywhere in the public tree.
inv_no_internal_hostnames :-
    facts:internal_hostname_leaks(0).

%% Program state consistency: done/1 facts must reference real tasks.
inv_state_consistent :-
    forall(website_kb:completed(T), plan:task(T, _)).

%% Program complete: every task done.
inv_program_complete :-
    website_kb:progress(_, _),
    \+ (plan:task(T, _), \+ website_kb:completed(T)).

%% ---- runner ----

all_checks([
    ci_systems_present-inv_ci_systems_present,
    ci_workflows_self_contained-inv_ci_workflows_self_contained,
    ci_secrets_not_embedded-inv_ci_secrets_not_embedded,
    no_internal_hosts_in_ci-inv_no_internal_hosts_in_ci,
    ci_runs_prolog-inv_ci_runs_prolog,
    www_aliases_apex-inv_www_aliases_apex,
    docs_deferred-inv_docs_deferred,
    published_docs_have_provenance-inv_published_docs_have_provenance,
    research_approval_gated-inv_research_approval_gated,
    daily_dates_match-inv_daily_dates_match,
    radar_safe-inv_radar_safe,
    v09_pinned-inv_v09_pinned,
    auto_dig_tooling-inv_auto_dig_tooling,
    opencode_harness-inv_opencode_harness,
    publishing_config-inv_publishing_config,
    no_internal_hostnames-inv_no_internal_hostnames,
    state_consistent-inv_state_consistent,
    program_complete-inv_program_complete
]).

verify_steps(IncludeProgram) :-
    retractall(failure(_, _)),
    retractall(passed(_)),
    all_checks(Checks0),
    (   IncludeProgram == true ->
        Checks = Checks0
    ;   exclude(name_is_program_complete, Checks0, Checks)),
    forall(member(Name-Goal, Checks),
           (   catch(check(Name, Goal), Error,
                   (assertz(failure(Name, exception(Error))),
                    format('FAIL  ~w (exception)~n', [Name]))))),
    findall(F, failure(F, _), Fs),
    website_kb:progress(Done, Total),
    (   Fs == [] ->
        format('~nVERIFIED: all invariants hold. Program: [~w/~w] tasks.~n', [Done, Total]),
        halt(0)
    ;   length(Fs, N),
        format('~nVERIFICATION FAILED: ~w invariant(s).~n', [N]),
        halt(1)).

%% Full program verification: includes the program_complete gate.
verify_all :-
    verify_steps(true).

%% CI verification: repository invariants only.
verify_ci :-
    verify_steps(false).

name_is_program_complete(Name-_Goal) :- Name == program_complete.
