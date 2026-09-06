% Task-specific verification for the obsidian-gold website migration.
:- set_prolog_flag(unknown, error).
:- use_module(library(plunit)).
:- use_module(library(time)).
:- ensure_loaded('facts.kb').

% Resolve repository-root-relative paths from this file's location.
:- prolog_load_context(source, Src),
   absolute_file_name(Src, AbsSrc),
   file_directory_name(AbsSrc, Dir0),
   file_directory_name(Dir0, Root),
   assertz(root(Root)).

rp(Rel, Abs) :- root(Root), atom_concat('/', Rel, Tail), atom_concat(Root, Tail, Abs).

read_repo_file(Rel, Codes) :-
    rp(Rel, Abs),
    exists_file(Abs),
    read_file_to_codes(Abs, Codes, []).

current_successful_observation :-
    repo_state(Head, Digest),
    observation(_, _, exit(0), _, Head, Digest).

current_research_evidence :-
    research_required(false).
current_research_evidence :-
    research_required(true),
    repo_state(Head, Digest),
    brave_search(_, _, _, Head, Digest).

base_complete :-
    task(_),
    current_successful_observation,
    current_research_evidence.

% ---- task-specific invariants ----

% The design package is vendored with a pinned upstream hash and provenance.
vendored_design_package :-
    rp('/packages/design/package.json', P), exists_file(P),
    rp('/packages/design/.upstream.sha256', Pin), exists_file(Pin),
    rp('/packages/design/UPSTREAM.json', U), exists_file(U),
    read_repo_file('/packages/design/UPSTREAM.json', UC),
    atom_codes(UA, UC),
    sub_atom(UA, _, _, _, 'starintel-labs/starintel-design').

% All apps + content consume @starintel/design; packages/ui is gone.
consumes_starintel_design :-
    read_repo_file('/apps/main/package.json', M),
    atom_codes(MA, M),
    sub_atom(MA, _, _, _, '"@starintel/design": "workspace:*"'),
    \+ (rp('/packages/ui/package.json', UI), exists_file(UI)).

% The main page declares the obsidian-gold theme and the semantic canvas token.
obsidian_gold_theme :-
    read_repo_file('/apps/main/index.html', H),
    atom_codes(HA, H),
    sub_atom(HA, _, _, _, 'data-si-theme="obsidian-gold"'),
    sub_atom(HA, _, _, _, 'obsidian-gold'),
    % the vendored theme must carry the obsidian canvas + gold accents
    read_repo_file('/packages/design/src/css/tokens.css', T),
    atom_codes(TA, T),
    sub_atom(TA, _, _, _, '--si-bg-canvas: #090807'),
    sub_atom(TA, _, _, _, '--si-accent-primary: #e0b04a').

% Honesty guards: the landing page must not fake telemetry and must carry
% the fail-closed empty state language.
no_fabricated_data :-
    read_repo_file('/apps/main/index.html', H),
    atom_codes(HA, H),
    \+ sub_atom(HA, _, _, _, 'Verified Reasoning'),
    sub_atom(HA, _, _, _, 'fail closed').

% The playwright smoke suite exists and covers the real server.
ui_smoke_tests :-
    rp('/tests/ui-smoke.test.ts', T), exists_file(T),
    read_repo_file('/tests/ui-smoke.test.ts', S),
    atom_codes(SA, S),
    sub_atom(SA, _, _, _, 'obsidian-gold'),
    sub_atom(SA, _, _, _, 'si-topbar__nav').

% Real, machine-recorded evidence against the current tree.
observed_ok(Args) :-
    repo_state(Head, Digest),
    observation(_, command(Args), exit(0), _, Head, Digest).

all_evidence :-
    forall(member(Args, [['pnpm', 'build'],
                         ['pnpm', 'test'],
                         ['pnpm', 'typecheck'],
                         ['node', 'scripts/sync-v09-schema.mjs', '--check'],
                         ['node', 'scripts/sync-design.mjs', '--check'],
                         ['node', 'scripts/ci-hygiene.mjs']]),
           observed_ok(Args)).

complete :-
    base_complete,
    vendored_design_package,
    consumes_starintel_design,
    obsidian_gold_theme,
    no_fabricated_data,
    ui_smoke_tests,
    all_evidence.

:- begin_tests(workspace_verification).

test(complete) :-
    once(complete).

:- end_tests(workspace_verification).

main :-
    catch(call_with_time_limit(60, (run_tests, once(complete))),
          Error,
          (print_message(error, Error), fail)),
    !,
    halt(0).
main :-
    halt(1).

:- initialization(main, main).
