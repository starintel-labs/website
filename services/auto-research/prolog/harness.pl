:- module(auto_research_harness, []).

:- use_module(library(filesex)).
:- use_module(library(http/json)).
:- use_module(library(readutil)).

:- initialization(main, main).

main(Argv) :-
    catch(run(Argv), Error, fail_with(Error)).

run(Argv) :-
    parse_args(Argv, Options),
    require_option(run_dir, Options, RunDir),
    require_option(prolog_rlm_root, Options, RlmRoot),
    require_option(model, Options, Model0),
    require_option(prompt_file, Options, PromptFile),
    load_rlm_modules(RlmRoot),
    directory_file_path(RunDir, 'workspace', Workspace),
    make_directory_path(Workspace),
    directory_file_path(RunDir, 'effects.journal', EffectStore),
    rlm_effect:rlm_effect_store_open(EffectStore),
    rlm_tool:tool_registry_create(Registry),
    Authority = session(auto_research),
    setup_call_cleanup(
        rlm_authority:rlm_set_authority(Authority, dangerous, ok(_)),
        execute_direct(RunDir, Workspace, PromptFile, Model0, Registry,
                       Authority, Outcome),
        cleanup_runtime(Registry)),
    write_outcome(RunDir, Outcome),
    ( Outcome = ok(_) -> true ; halt(2) ).

execute_direct(RunDir, Workspace, PromptFile, Model0, Registry, Authority,
               Outcome) :-
    register_native_tools(Registry, Workspace),
    directory_file_path(RunDir, 'request.json', RequestFile),
    read_file_to_string(PromptFile, Prompt, []),
    read_file_to_string(RequestFile, Request, []),
    format(string(Query), '~s\n\n## Run request\n\n```json\n~s\n```\n',
           [Prompt, Request]),
    atom_string(Model, Model0),
    rlm_chain:openrouter_provider(Model, Provider),
    Handler = auto_research_harness:model_handler(Provider),
    Capabilities = [
        tool(project_list),
        tool(project_read),
        tool(project_write),
        tool(project_append),
        context(peek)
    ],
    Options = [
        provider(Provider),
        provider_name(openrouter),
        model_handler(Handler),
        tool_registry(Registry),
        prompt_compile_mode(all_tools),
        capabilities(Capabilities),
        authority_context(Authority),
        budget(_{
            max_model_calls:24,
            max_tool_calls:32,
            max_context_ops:32,
            max_native_calls_per_batch:4,
            max_total_tokens:64000,
            max_cost_usd:2.0,
            max_output_bytes:1048576,
            max_iterations:64,
            time_limit:840.0
        }),
        planner_max_tokens(8192),
        temperature(0.1)
    ],
    rlm_direct:rlm_direct(Query,
                          text("Run request is embedded in the user query."),
                          Options,
                          Outcome).

model_handler(Provider, Request, Outcome) :-
    rlm_chain:model_complete_execute(Provider, Request, Outcome).

register_native_tools(Registry, Workspace) :-
    register_project_list(Registry, Workspace),
    register_project_read(Registry, Workspace),
    register_project_write(Registry, Workspace),
    register_project_append(Registry, Workspace).

register_project_list(Registry, Workspace) :-
    Schema = tool_schema{
        name:project_list,
        description:"List files or directories beneath the Auto Research run workspace",
        capability:tool(project_list),
        effect:read,
        arguments:_{
            type:object,
            properties:_{path:_{type:string}},
            required:[path],
            additional_properties:false
        },
        result:_{
            type:object,
            properties:_{
                path:_{type:string},
                entries:_{type:array,items:_{type:string}}
            },
            required:[path,entries],
            additional_properties:false
        },
        limits:_{time_limit:2.0,max_output_bytes:32768}
    },
    Handler = auto_research_harness:project_list_handler(Workspace),
    rlm_tool:tool_register(Registry, Schema, Handler, ok(_)).

register_project_read(Registry, Workspace) :-
    Schema = tool_schema{
        name:project_read,
        description:"Read one UTF-8 file beneath the Auto Research run workspace",
        capability:tool(project_read),
        effect:read,
        arguments:_{
            type:object,
            properties:_{path:_{type:string}},
            required:[path],
            additional_properties:false
        },
        result:_{
            type:object,
            properties:_{
                path:_{type:string},
                content:_{type:string},
                truncated:_{type:boolean}
            },
            required:[path,content,truncated],
            additional_properties:false
        },
        limits:_{time_limit:2.0,max_output_bytes:270000}
    },
    Handler = auto_research_harness:project_read_handler(Workspace),
    rlm_tool:tool_register(Registry, Schema, Handler, ok(_)).

register_project_write(Registry, Workspace) :-
    Schema = tool_schema{
        name:project_write,
        description:"Create or replace one UTF-8 file beneath the Auto Research run workspace",
        capability:tool(project_write),
        effect:write,
        arguments:_{
            type:object,
            properties:_{path:_{type:string},content:_{type:string}},
            required:[path,content],
            additional_properties:false
        },
        result:_{
            type:object,
            properties:_{path:_{type:string},characters:_{type:integer}},
            required:[path,characters],
            additional_properties:false
        },
        limits:_{time_limit:3.0,max_output_bytes:4096}
    },
    Handler = auto_research_harness:project_write_handler(Workspace),
    rlm_tool:tool_register(Registry, Schema, Handler, ok(_)).

register_project_append(Registry, Workspace) :-
    Schema = tool_schema{
        name:project_append,
        description:"Append UTF-8 text to one file beneath the Auto Research run workspace",
        capability:tool(project_append),
        effect:write,
        arguments:_{
            type:object,
            properties:_{path:_{type:string},content:_{type:string}},
            required:[path,content],
            additional_properties:false
        },
        result:_{
            type:object,
            properties:_{path:_{type:string},characters:_{type:integer}},
            required:[path,characters],
            additional_properties:false
        },
        limits:_{time_limit:3.0,max_output_bytes:4096}
    },
    Handler = auto_research_harness:project_append_handler(Workspace),
    rlm_tool:tool_register(Registry, Schema, Handler, ok(_)).

project_list_handler(Workspace, Args, Result) :-
    relative_workspace_path(Workspace, Args.path, Path, Relative),
    ( exists_directory(Path) -> true ; throw(error(existence_error(directory, Relative), _)) ),
    directory_files(Path, RawEntries),
    exclude(dot_entry, RawEntries, Entries0),
    maplist(atom_string, Entries0, Entries),
    Result = json{path:Relative, entries:Entries}.

project_read_handler(Workspace, Args, Result) :-
    relative_workspace_path(Workspace, Args.path, Path, Relative),
    ( exists_file(Path) -> true ; throw(error(existence_error(file, Relative), _)) ),
    setup_call_cleanup(
        open(Path, read, Stream, [encoding(utf8),type(text)]),
        ( read_string(Stream, 262144, Content),
          ( at_end_of_stream(Stream) -> Truncated = false ; Truncated = true )
        ),
        close(Stream)),
    Result = json{path:Relative, content:Content, truncated:Truncated}.

project_write_handler(Workspace, Args, Result) :-
    relative_workspace_path(Workspace, Args.path, Path, Relative),
    text_string(Args.content, Content),
    file_directory_name(Path, Parent),
    make_directory_path(Parent),
    setup_call_cleanup(
        open(Path, write, Stream, [encoding(utf8),type(text)]),
        write(Stream, Content),
        close(Stream)),
    string_length(Content, Characters),
    Result = json{path:Relative, characters:Characters}.

project_append_handler(Workspace, Args, Result) :-
    relative_workspace_path(Workspace, Args.path, Path, Relative),
    text_string(Args.content, Content),
    file_directory_name(Path, Parent),
    make_directory_path(Parent),
    setup_call_cleanup(
        open(Path, append, Stream, [encoding(utf8),type(text)]),
        write(Stream, Content),
        close(Stream)),
    string_length(Content, Characters),
    Result = json{path:Relative, characters:Characters}.

relative_workspace_path(Workspace, Input, Path, Relative) :-
    text_string(Input, Relative),
    Relative \== "",
    \+ sub_string(Relative, 0, 1, _, "/"),
    \+ sub_string(Relative, _, _, _, "\\"),
    string_codes(Relative, Codes),
    \+ memberchk(0, Codes),
    split_string(Relative, "/", "", Parts),
    Parts \== [],
    maplist(valid_path_part, Parts),
    atom_string(RelativeAtom, Relative),
    directory_file_path(Workspace, RelativeAtom, Path).

valid_path_part(Part) :-
    Part \== "",
    Part \== ".",
    Part \== "..".

dot_entry('.').
dot_entry('..').

text_string(Value, String) :-
    ( string(Value) -> String = Value
    ; atom(Value) -> atom_string(Value, String)
    ; throw(error(type_error(text, Value), _))
    ).

write_outcome(RunDir, Outcome) :-
    directory_file_path(RunDir, 'result.json', ResultFile),
    term_string(Outcome, Raw, [quoted(true),max_depth(32)]),
    outcome_projection(Outcome, Projection0),
    put_dict(raw, Projection0, Raw, Projection),
    setup_call_cleanup(
        open(ResultFile, write, Stream, [encoding(utf8),type(text)]),
        json_write_dict(Stream, Projection, [width(0)]),
        close(Stream)).

outcome_projection(ok(Result), _{status:"ok", value:Value}) :-
    !,
    ( get_dict(value, Result, Value0) -> text_string(Value0, Value) ; Value = "" ).
outcome_projection(error(Error), _{status:"error", error:ErrorText}) :-
    !,
    term_string(Error, ErrorText, [quoted(true),max_depth(24)]).
outcome_projection(Other, _{status:"error", error:Text}) :-
    term_string(Other, Text, [quoted(true),max_depth(24)]).

cleanup_runtime(Registry) :-
    catch(rlm_tool:tool_registry_destroy(Registry), _, true),
    catch(rlm_effect:rlm_effect_store_close, _, true).

load_rlm_modules(Root) :-
    maplist(load_rlm_module(Root),
            ['prolog/rlm_chain.pl',
             'prolog/rlm_direct.pl',
             'prolog/rlm_tool.pl',
             'prolog/rlm_authority.pl',
             'prolog/rlm_effect.pl']).

load_rlm_module(Root, Relative) :-
    directory_file_path(Root, Relative, Path),
    ( exists_file(Path) -> true ; throw(error(existence_error(file, Path), _)) ),
    load_files(Path, [silent(true),if(not_loaded)]).

parse_args(Args, Options) :-
    parse_args(Args, _{}, Options).

parse_args([], Options, Options).
parse_args(['--run-dir', Value | Rest], Options0, Options) :-
    !,
    put_dict(run_dir, Options0, Value, Options1),
    parse_args(Rest, Options1, Options).
parse_args(['--prolog-rlm-root', Value | Rest], Options0, Options) :-
    !,
    put_dict(prolog_rlm_root, Options0, Value, Options1),
    parse_args(Rest, Options1, Options).
parse_args(['--model', Value | Rest], Options0, Options) :-
    !,
    put_dict(model, Options0, Value, Options1),
    parse_args(Rest, Options1, Options).
parse_args(['--prompt-file', Value | Rest], Options0, Options) :-
    !,
    put_dict(prompt_file, Options0, Value, Options1),
    parse_args(Rest, Options1, Options).
parse_args([Unknown | _], _, _) :-
    throw(error(domain_error(auto_research_argument, Unknown), _)).

require_option(Name, Options, Value) :-
    ( get_dict(Name, Options, Value) -> true
    ; throw(error(existence_error(option, Name), _))
    ).

fail_with(Error) :-
    print_message(error, Error),
    halt(1).
