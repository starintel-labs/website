:- use_module('../prolog/blog_phrases.pl').
:- begin_tests(blog_phrases).

test(four_hundred_distinct_tag_aware_phrases) :-
    findall(Phrase,
            (topic(_, Subject, _), phrase_template(Template),
             format(string(Phrase), Template, [Subject])), Phrases),
    sort(Phrases, Unique), length(Unique, 400).

test(case_insensitive_tag) :-
    announcement_phrase(["PROLOG"], 7, Phrase), once(sub_string(Phrase, _, _, _, "Prolog")).

test(unknown_tags_use_general_topic) :-
    announcement_phrase(["ai_123", "unmapped-tag"], 3, Phrase),
    once(sub_string(Phrase, _, _, _, "StarIntel")).

test(empty_tags_use_general_topic) :-
    announcement_phrase([], 0, "Fresh from the blog: StarIntel.").

test(stable_selection) :-
    announcement_phrase(["prolog", "nix"], 123456789, A),
    announcement_phrase(["nix", "prolog", "prolog"], 123456789, A).

test(multiple_tags_only_select_supported_topics) :-
    forall(between(0, 99, Seed),
           (announcement_phrase(["prolog", "actors"], Seed, Phrase),
            (sub_string(Phrase, _, _, _, "Prolog");
             sub_string(Phrase, _, _, _, "actors")))).

test(all_topics_and_templates_selectable) :-
    forall((topic(_, Subject, Aliases), between(0, 24, Seed)),
           ( (Aliases = [Tag|_] -> Tags = [Tag]; Tags = []),
             announcement_phrase(Tags, Seed, Phrase),
             sub_string(Phrase, _, _, _, Subject) )).

test(negative_seed_rejected, [throws(error(type_error(nonneg, -1), _))]) :-
    announcement_phrase([], -1, _).

:- end_tests(blog_phrases).
