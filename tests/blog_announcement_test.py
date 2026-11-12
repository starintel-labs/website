"""No network: exercise the actual announcement/state boundaries and Prolog CLI."""
import base64
import copy
import importlib.util
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "announce_blog", Path(__file__).resolve().parents[1] / "scripts/announce-blog.py")
blog = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(blog)
NOW = datetime(2026, 11, 12, tzinfo=timezone.utc)
HOOK = "https://discord.com/api/webhooks/123456789/test-only-not-a-real-webhook"
URL = blog.BLOG + "/new-post/"


def feed(items=None):
    if items is None:
        items = [(URL, "Logic &amp; actors", "Wed, 11 Nov 2026 12:00:00 GMT", "prolog")]
    return (f'<rss version="2.0"><channel><link>{blog.BLOG}/</link>' + "".join(
        f"<item><title>{title}</title><link>{url}</link><pubDate>{date}</pubDate>"
        f"<category>{tag}</category></item>" for url, title, date, tag in items)
        + "</channel></rss>").encode()


def article(url=URL, title="Logic &amp; actors"):
    return (f'<html><head><title>{title} — StarIntel Blog</title>'
            f'<link rel="canonical" href="{url}"></head><body><article>post</article></body></html>').encode()


class HTTP:
    def __init__(self):
        self.routes = {blog.BLOG + "/feed.xml": ("application/rss+xml", feed()),
                       URL: ("text/html", article())}
        self.sent = []
        self.send_error = None

    def request(self, url, method="GET", data=None, token=None):
        if url == HOOK + "?wait=true":
            self.sent.append(copy.deepcopy(data))
            if self.send_error:
                raise self.send_error
            return "application/json", b'{"id":"123456789012345"}'
        result = self.routes[url]
        if isinstance(result, Exception):
            raise result
        return result


class Store:
    def __init__(self):
        self.state = {"version": 1, "posts": {}}
        self.saves = []
        self.fail_save = None

    def load(self):
        return copy.deepcopy(self.state)

    def save(self, state):
        if self.fail_save == len(self.saves) + 1:
            raise blog.RemoteError(409)
        self.state = copy.deepcopy(state)
        self.saves.append(copy.deepcopy(state))


class AnnouncementTests(unittest.TestCase):
    def setUp(self):
        self.http, self.store = HTTP(), Store()

    def run_announce(self, **kwargs):
        return blog.announce(self.http, self.store, HOOK, NOW,
                             phrase_selector=lambda post: "A fresh look at Prolog.", **kwargs)

    def test_live_post_reserves_then_confirms_and_never_repeats(self):
        self.assertEqual(self.run_announce(), 1)
        self.assertEqual(self.store.saves[0]["posts"][URL]["status"], "pending")
        self.assertEqual(self.store.state["posts"][URL]["status"], "sent")
        self.assertEqual(self.run_announce(), 0)
        self.assertEqual(len(self.http.sent), 1)
        payload = self.http.sent[0]
        self.assertIn("New Blog Post", payload["content"])
        self.assertIn(URL, payload["content"])
        self.assertEqual(payload["username"], "starintel")
        self.assertEqual(payload["allowed_mentions"], {"parse": []})

    def test_feed_not_live_does_not_create_state_or_send(self):
        for status in (403, 404, 502, 503, 504):
            self.http.routes[blog.BLOG + "/feed.xml"] = blog.RemoteError(status)
            self.assertEqual(self.run_announce(), 0)
        self.assertFalse(self.store.saves)
        self.assertFalse(self.http.sent)

    def test_feed_other_error_fails_closed(self):
        self.http.routes[blog.BLOG + "/feed.xml"] = blog.RemoteError(401)
        with self.assertRaises(blog.RemoteError):
            self.run_announce()

    def test_article_not_live_is_retried_later(self):
        self.http.routes[URL] = blog.RemoteError(404)
        self.assertEqual(self.run_announce(), 0)
        self.assertFalse(self.store.saves)
        self.http.routes[URL] = ("text/html", article())
        self.assertEqual(self.run_announce(), 1)

    def test_fallback_wrong_canonical_wrong_title_and_non_html_rejected(self):
        for kind, body in [("text/html", b"<html>holding page</html>"),
                           ("text/html", article(blog.BLOG + "/different/")),
                           ("text/html", article(title="Old cached title")),
                           ("application/json", article())]:
            self.http.routes[URL] = (kind, body)
            self.assertEqual(self.run_announce(), 0)
        self.assertFalse(self.http.sent)

    def test_future_posts_ignored(self):
        self.http.routes[blog.BLOG + "/feed.xml"] = ("application/rss+xml", feed([
            (URL, "Future", "Fri, 13 Nov 2026 12:00:00 GMT", "prolog")]))
        self.assertEqual(self.run_announce(), 0)

    def test_non_xml_or_malformed_feed_fails_closed(self):
        for kind, body in [("text/html", feed()), ("application/xml", b"broken")]:
            self.http.routes[blog.BLOG + "/feed.xml"] = (kind, body)
            with self.assertRaises((ValueError, blog.ET.ParseError)):
                self.run_announce()
        self.assertFalse(self.http.sent)

    def test_external_feed_urls_and_duplicates_rejected(self):
        rows = [(URL, "Post", "Wed, 11 Nov 2026 12:00:00 GMT", "prolog")]
        for body in (feed(rows + rows), feed().replace(URL.encode(), b"https://evil.example/post/"),
                     feed().replace(b"<pubDate>", b"<bad-date>")):
            with self.assertRaises((ValueError, TypeError, blog.ET.ParseError)):
                blog.parse_feed(body, NOW)

    def test_url_allowlist_blocks_ssrf_and_url_ambiguity(self):
        for url in ["http://blog.starintel.actor/post/", "https://localhost/post/",
                    "https://blog.starintel.actor.evil/post/", "https://user@blog.starintel.actor/post/",
                    "https://blog.starintel.actor/post/?token=x", "https://blog.starintel.actor/../post/",
                    "https://blog.starintel.actor/post/#x", "https://blog.starintel.actor/%2e%2e/"]:
            with self.assertRaises(ValueError):
                blog.post_url(url)

    def test_reservation_conflict_never_sends(self):
        self.store.fail_save = 1
        with self.assertRaises(blog.RemoteError):
            self.run_announce()
        self.assertFalse(self.http.sent)

    def test_ambiguous_send_blocks_future_duplicate(self):
        self.http.send_error = TimeoutError("ambiguous response")
        with self.assertRaises(TimeoutError):
            self.run_announce()
        with self.assertRaisesRegex(RuntimeError, "Pending delivery"):
            self.run_announce()
        self.assertEqual(len(self.http.sent), 1)
        self.assertEqual(self.store.state["posts"][URL]["status"], "pending")

    def test_failed_confirmation_write_does_not_repeat_delivery(self):
        self.store.fail_save = 2
        with self.assertRaises(blog.RemoteError):
            self.run_announce()
        with self.assertRaisesRegex(RuntimeError, "Pending delivery"):
            self.run_announce()
        self.assertEqual(len(self.http.sent), 1)

    def test_edits_do_not_reannounce_same_url(self):
        self.run_announce()
        self.http.routes[blog.BLOG + "/feed.xml"] = (
            "application/rss+xml", feed().replace(b"Logic &amp; actors", b"Edited title"))
        self.assertEqual(self.run_announce(), 0)

    def test_multiple_posts_oldest_first_and_batch_limit(self):
        rows = []
        for n in range(1, 6):
            url = blog.BLOG + f"/post-{n}/"
            rows.append((url, f"Post {n}", f"Wed, 11 Nov 2026 0{n}:00:00 GMT", "prolog"))
            self.http.routes[url] = ("text/html", article(url, f"Post {n}"))
        self.http.routes[blog.BLOG + "/feed.xml"] = ("application/rss+xml", feed(list(reversed(rows))))
        self.assertEqual(self.run_announce(), 3)
        self.assertEqual(list(self.store.state["posts"]), [r[0] for r in rows[:3]])
        self.assertEqual(self.run_announce(), 2)

    def test_live_tags_reach_actual_prolog_selector(self):
        post = blog.parse_feed(feed(), NOW)[0]
        phrase = blog.select_phrase(post)
        self.assertIn("Prolog", phrase)
        self.assertEqual(phrase, blog.select_phrase(post))

    def test_untrusted_tags_are_data_not_executable_prolog(self):
        post = {"url": URL, "tags": ["'),halt(1),('"]}
        self.assertIn("StarIntel", blog.select_phrase(post))

    def test_remote_error_does_not_disclose_response_or_url(self):
        self.assertEqual(str(blog.RemoteError(403)),
                         "Remote request failed (HTTP 403); response withheld")

    def test_redirects_are_not_followed(self):
        self.assertIsNone(blog.NoRedirects().redirect_request(None, None, 302, "", {}, "https://evil.example"))

    def test_feed_order_or_removal_never_forgets_sent_urls(self):
        self.run_announce()
        self.http.routes[blog.BLOG + "/feed.xml"] = ("application/rss+xml", feed([]))
        self.assertEqual(self.run_announce(), 0)
        self.http.routes[blog.BLOG + "/feed.xml"] = ("application/rss+xml", feed())
        self.assertEqual(self.run_announce(), 0)
        self.assertEqual(len(self.http.sent), 1)

    def test_discord_rejection_requires_operator_not_automatic_retry(self):
        self.http.send_error = blog.RemoteError(429)
        with self.assertRaises(blog.RemoteError):
            self.run_announce()
        with self.assertRaisesRegex(RuntimeError, "Pending delivery"):
            self.run_announce()
        self.assertEqual(len(self.http.sent), 1)

    def test_article_redirect_is_not_treated_as_live(self):
        self.http.routes[URL] = blog.RemoteError(302)
        with self.assertRaises(blog.RemoteError):
            self.run_announce()
        self.assertFalse(self.http.sent)

    def test_discord_mentions_cannot_ping_from_title(self):
        self.http.routes[blog.BLOG + "/feed.xml"] = ("application/rss+xml", feed([
            (URL, "@everyone &lt;@12345&gt; *markup*", "Wed, 11 Nov 2026 12:00:00 GMT", "prolog")]))
        self.http.routes[URL] = ("text/html", article(title="@everyone &lt;@12345&gt; *markup*"))
        self.run_announce()
        self.assertEqual(self.http.sent[0]["allowed_mentions"], {"parse": []})
        self.assertIn(r"\*markup\*", self.http.sent[0]["content"])


class ForgeStateTests(unittest.TestCase):
    def make_store(self):
        return blog.ForgeState(HTTP(), "https://git.example", "org/website", "test-token")

    def test_load_valid_state(self):
        store = self.make_store()
        state = {"version": 1, "posts": {URL: {"status": "sent", "message_id": "123"}}}
        result = {"sha": "original", "content": base64.b64encode(json.dumps(state).encode()).decode()}
        with patch.object(store, "api", return_value=result):
            self.assertEqual(store.load(), state)
        self.assertEqual(store.sha, "original")

    def test_invalid_state_fails_closed(self):
        for state in [{"version": 2, "posts": {}},
                      {"version": 1, "posts": {URL: {"status": "unknown"}}}]:
            store = self.make_store()
            result = {"sha": "x", "content": base64.b64encode(json.dumps(state).encode()).decode()}
            with patch.object(store, "api", return_value=result), self.assertRaises(ValueError):
                store.load()

    def test_new_state_branch_created_only_on_404(self):
        store = self.make_store()
        with patch.object(store, "api", side_effect=[blog.RemoteError(404), blog.RemoteError(404), {}]) as api:
            self.assertEqual(store.load(), {"version": 1, "posts": {}})
            self.assertEqual(api.call_args.args, ("/branches", "POST", {
                "new_branch_name": blog.STATE_BRANCH, "old_ref_name": "main"}))
        with patch.object(store, "api", side_effect=blog.RemoteError(403)), self.assertRaises(blog.RemoteError):
            store.load()

    def test_save_uses_sha_for_optimistic_concurrency(self):
        store = self.make_store()
        with patch.object(store, "api", return_value={"content": {"sha": "next"}}) as api:
            store.save({"version": 1, "posts": {}})
            self.assertEqual(api.call_args.args[1], "POST")
            self.assertNotIn("sha", api.call_args.args[2])
            store.save({"version": 1, "posts": {}})
            self.assertEqual(api.call_args.args[1], "PUT")
            self.assertEqual(api.call_args.args[2]["sha"], "next")


if __name__ == "__main__":
    unittest.main()
