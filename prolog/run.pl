%% run.pl -- entry point for the website program KB and verification.
%%
%% Loads every module by explicit path (immune to -s load-context quirks
%% across SWI versions), then exposes:
%%   run:verify_all  -- all invariants including the program_complete gate
%%   run:verify_ci   -- repository invariants only (used by CI)
%%   run:print_plan  -- task board

:- module(run, [verify_all/0, verify_ci/0, print_plan/0]).

:- prolog_load_context(directory, Dir),
   atom_concat(Dir, '/', Prefix),
   atom_concat(Prefix, 'plan.pl', PlanF),
   atom_concat(Prefix, 'state.pl', StateF),
   atom_concat(Prefix, 'generated_facts.pl', FactsF),
   atom_concat(Prefix, 'website_kb.pl', KbF),
   atom_concat(Prefix, 'verify.pl', VerifyF),
   use_module(PlanF),
   use_module(StateF),
   use_module(FactsF),
   use_module(KbF),
   use_module(VerifyF).

verify_all :- verify:verify_steps(true).
verify_ci :- verify:verify_steps(false).
print_plan :- website_kb:print_plan.
