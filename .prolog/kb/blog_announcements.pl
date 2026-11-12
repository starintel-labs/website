% Blog announcement transport and delivery invariants, tested offline.
blog_announcement_authority('https://blog.starintel.actor/feed.xml', live_rss_and_matching_article).
blog_announcement_workflow('.forgejo/workflows/blog-discord.yml', main_only, every_fifteen_minutes).
blog_announcement_copy('prolog/blog_phrases.pl', 25, 16, 400).
blog_announcement_state('blog-announcement-state', 'blog-announcements.json', canonical_url).
blog_announcement_delivery(reserve_sha_before_discord, pending_then_sent, no_automatic_retry_of_pending).
blog_announcement_recovery(pending, inspect_discord_then_mark_sent_or_remove_if_definitely_undelivered).
blog_announcement_secrets('BLOG_DISCORD_WEBHOOK', 'BLOG_ANNOUNCEMENT_TOKEN').
blog_announcement_tests('tests/blog_announcement_test.py', 'tests/blog_phrases_test.pl').
