%% website_kb.pl -- query layer over plan.pl and state.pl.
%%
%% Load with: swipl -q -s prolog/plan.pl -s prolog/state.pl -s prolog/website_kb.pl -t goal

:- module(website_kb, [
    completed/1,
    failed/1,
    ready/1,
    blocked/2,
    next_task/1,
    pending/1,
    progress/2,
    task_status/2,
    print_plan/0,
    program_complete/0
]).

%% completed(Task) -- task marked done in persisted state.
completed(Task) :- state:done(Task).

%% failed(Task, Reason) -- task marked failed in persisted state.
failed(Task) :- catch(state:failed(Task, _), _, fail).

%% pending(Task) -- defined, not done, not failed.
pending(Task) :-
    plan:task(Task, _),
    \+ completed(Task),
    \+ failed(Task).

%% blocked(Task, Dependency) -- a pending task and one unfinished prerequisite.
blocked(Task, Dep) :-
    pending(Task),
    plan:depends(Task, Dep),
    \+ completed(Dep).

%% ready(Task) -- pending with all prerequisites completed.
ready(Task) :-
    pending(Task),
    \+ blocked(Task, _).

%% next_task(Task) -- highest-priority ready task (declaration order in plan.pl).
next_task(Task) :-
    findall(T, ready(T), Ts),
    Ts \= [],
    nth0(0, Ts, Task).

%% progress(Done, Total) over all defined tasks.
progress(Done, Total) :-
    findall(T, plan:task(T, _), Ts),
    length(Ts, Total),
    findall(D, (member(D, Ts), completed(D)), Ds),
    length(Ds, Done).

%% task_status(Task, Status) -- done | failed | ready | blocked | waiting.
task_status(Task, done) :- completed(Task).
task_status(Task, failed) :- failed(Task).
task_status(Task, ready) :- ready(Task).
task_status(Task, blocked) :- blocked(Task, _).
task_status(Task, waiting) :- pending(Task), \+ blocked(Task, _).

print_plan :-
    forall(plan:task(T, Desc), (
        (   task_status(T, done) -> S = 'DONE'
        ;   task_status(T, failed) -> S = 'FAILED'
        ;   task_status(T, ready) -> S = 'READY'
        ;   task_status(T, blocked) -> S = 'BLOCKED'
        ;   S = 'WAITING'
        ),
        format('~w  ~w  ~s~n', [S, T, Desc])
    )),
    progress(D, T),
    format('~n[~w/~w] tasks complete~n', [D, T]).

program_complete :-
    progress(D, T),
    D =:= T,
    \+ failed(_).
