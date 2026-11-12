# Live blog announcements

Forgejo's **Announce live blog posts** workflow polls
`https://blog.starintel.actor/feed.xml` every 15 minutes, or on manual dispatch
from `main`. It does not publish editorial content or deploy the site. GitHub
does not run a second announcer.

## Before enabling

Set repository Actions secret `BLOG_DISCORD_WEBHOOK` to the Discord webhook URL.
Never put it in a workflow, content file, variable, issue, or commit. The supplied
webhook is configured separately from source. Messages use username `starintel`,
the project avatar, **New Blog Post**, tag-aware copy, the title and the post URL.
Discord's APP badge is normal for webhooks. Mentions are disabled.

The workflow requests `contents: write` for its short-lived Actions token. If the
instance does not grant it branch/content API access, configure a repository-scoped
`BLOG_ANNOUNCEMENT_TOKEN` secret with only the required repository write access.
It must be able to create/update `blog-announcement-state`; no admin or unrelated
repository access is needed. Denied writes fail **before** any Discord message.

## Publication and phrase selection

Only the live RSS feed supplies titles, tags, dates and URLs. A build, draft,
content commit, or successful deploy alone cannot send a notification. The feed
must be valid XML with the canonical blog channel URL. Each eligible article
must return HTTP 200 HTML, an exact canonical URL, an article element and the
matching page title. Redirects are not followed. Only HTTPS article URLs under
the canonical blog hostname are accepted. Future-dated items wait.

403/404/502/503/504 from the feed mean "not live yet" and produce no messages;
article failures on those statuses wait for a later run. Other errors fail the
job. Responses are bounded, requests time out and errors do not log secrets.

The blog builder includes Org tags as RSS `<category>` elements.
`prolog/blog_phrases.pl` selects only subjects supported by those live tags,
with a generic StarIntel fallback. Its 25 copy templates across 16 subjects
give **400 distinct phrases**, checked by PlUnit. A URL-derived seed makes
selection deterministic. Tags cross the Python/Prolog boundary as JSON, not
executable goals. Copy is presentation text, not generated research or claims.

## Delivery state and recovery

`blog-announcement-state:blog-announcements.json` is the durable URL ledger.
It contains no credentials. Keep this branch, including when cleaning up
feature branches. The regular Forgejo CI excludes its bookkeeping commits.
Fresh installations announce the existing live feed, oldest first, at most
three posts per run. Later runs announce only unseen URLs. Edits to an already
announced URL do not announce again. There is no archive backfill beyond the
items in the current live feed.

The job reserves a URL with status `pending` using the Git content API's SHA
compare-and-swap **before** contacting Discord. It records `sent` plus the
confirmed Discord message ID afterward. Workflow concurrency serializes runs;
SHA conflicts fail closed before sending. A delivery timeout, rejection, or
failed confirmation write leaves `pending` and blocks further sends. We do not
claim transactional exactly-once delivery across Discord and Git.

To recover a pending entry, inspect the Discord channel first:

* If delivered, change the entry to `sent` and record the Discord message ID.
* If definitely not delivered, remove that URL entry to allow a retry.
* If uncertain, leave it pending. Do not reset the whole ledger or retry blindly.

Only an operator should reconcile ambiguous delivery. A missing state branch
starts a new ledger and can reannounce old URLs; never delete it casually.

## Local checks (no network or Discord sends)

```sh
python3 -m unittest discover -s tests -p 'blog_announcement_test.py'
swipl -q -s tests/blog_phrases_test.pl -g run_tests -t halt
pnpm build
pnpm test
node scripts/generate-facts.mjs
pnpm verify:ci
node scripts/ci-hygiene.mjs
```
