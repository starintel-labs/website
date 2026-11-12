:- module(blog_phrases, [announcement_phrase/3, topic/3, phrase_template/1, main/0]).
:- use_module(library(http/json)).
:- use_module(library(lists)).

% Presentation copy for this blog, not assertions about a post's capabilities.
topic(prolog, "Prolog and logic programming", ["prolog", "logic", "symbolic", "verification"]).
topic(actors, "actors and message passing", ["actors", "actor", "sento", "zeromq"]).
topic(lisp, "Lisp", ["lisp", "common-lisp", "emacs", "sbcl"]).
topic(nix, "Nix and reproducible systems", ["nix", "nixos", "flakes", "reproducibility"]).
topic(security, "security", ["security", "infosec", "privacy", "appsec"]).
topic(osint, "open-source intelligence", ["osint", "intelligence", "investigation"]).
topic(ai, "AI systems", ["ai", "llm", "agents", "machine-learning"]).
topic(data, "data and document systems", ["data", "schema", "documents", "database"]).
topic(web, "the web", ["web", "website", "frontend", "quasar"]).
topic(infrastructure, "infrastructure", ["infrastructure", "infra", "deployment", "observability", "server"]).
topic(research, "research", ["research", "analysis", "experiments"]).
topic(releases, "project updates", ["release", "releases", "changelog", "shipyard"]).
topic(tutorials, "technical learning", ["tutorial", "tutorials", "guide", "howto"]).
topic(engineering, "software engineering", ["engineering", "architecture", "testing", "development"]).
topic(community, "the community", ["community", "events", "collaboration"]).
topic(general, "StarIntel", []).

phrase_template("Fresh from the blog: ~s.").
phrase_template("The latest post turns to ~s.").
phrase_template("On the reading list today: ~s.").
phrase_template("A new entry in our notes on ~s.").
phrase_template("This time on the blog: ~s.").
phrase_template("More from the blog on ~s.").
phrase_template("A fresh page in the conversation about ~s.").
phrase_template("The blog has something new on ~s.").
phrase_template("New reading for anyone following ~s.").
phrase_template("Our latest writing touches on ~s.").
phrase_template("Back on the blog with ~s.").
phrase_template("In the latest entry: ~s.").
phrase_template("Another stop on the journey through ~s.").
phrase_template("A new addition to the archive on ~s.").
phrase_template("Today's blog link is about ~s.").
phrase_template("The conversation continues with ~s.").
phrase_template("A little more reading on ~s.").
phrase_template("The next page in our writing about ~s.").
phrase_template("Now on the blog: a post about ~s.").
phrase_template("Something new to read about ~s.").
phrase_template("The latest from our corner of ~s.").
phrase_template("A new post joins the collection on ~s.").
phrase_template("For readers interested in ~s: a new blog entry.").
phrase_template("The blog returns to ~s.").
phrase_template("A fresh entry for the ~s reading queue.").

eligible_topics(Tags, Topics) :-
    maplist(string_lower, Tags, Lower),
    findall(Subject, (topic(_, Subject, Aliases),
                     member(Tag, Lower), memberchk(Tag, Aliases)), Matches),
    sort(Matches, Unique),
    ( Unique = [] -> Topics = ["StarIntel"] ; Topics = Unique ).

% Stable per URL, restricted to topics supported by the published RSS tags.
announcement_phrase(Tags, Seed, Phrase) :-
    must_be(list(string), Tags), must_be(nonneg, Seed),
    eligible_topics(Tags, Topics), length(Topics, TopicCount),
    TopicIndex is Seed mod TopicCount, nth0(TopicIndex, Topics, Subject),
    findall(Template, phrase_template(Template), Templates), length(Templates, Count),
    Index is (Seed // TopicCount) mod Count, nth0(Index, Templates, Template),
    format(string(Phrase), Template, [Subject]).

main :-
    json_read_dict(current_input, Input),
    announcement_phrase(Input.tags, Input.seed, Phrase),
    json_write_dict(current_output, _{phrase:Phrase}), nl.
