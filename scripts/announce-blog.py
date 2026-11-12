#!/usr/bin/env python3
"""Announce verified live RSS posts; reserve each URL durably before Discord I/O."""
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path

BLOG = "https://blog.starintel.actor"
STATE_BRANCH = "blog-announcement-state"
STATE_FILE = "blog-announcements.json"
AVATAR = "https://cdn.discordapp.com/avatars/1570292765424885852/cf84142033478c7ddba12593efa3cdc4.png"
MAX_BYTES = 2_000_000


class RemoteError(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__(f"Remote request failed (HTTP {status}); response withheld")


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class HTTP:
    def request(self, url, method="GET", data=None, token=None):
        headers = {"User-Agent": "StarIntel-Blog-Announcements/1.0"}
        if token:
            headers["Authorization"] = f"token {token}"
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, method=method, headers=headers,
                                     data=json.dumps(data).encode() if data is not None else None)
        try:
            with urllib.request.build_opener(NoRedirects()).open(req, timeout=30) as res:
                if method == "GET" and res.status != 200:
                    raise RemoteError(res.status)
                body = res.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    raise ValueError("Remote response exceeds size limit")
                return res.headers.get_content_type(), body
        except urllib.error.HTTPError as exc:
            raise RemoteError(exc.code) from None


def post_url(url):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or parsed.netloc != "blog.starintel.actor"
            or not re.fullmatch(r"/[a-z0-9][a-z0-9-]*/", parsed.path)
            or parsed.query or parsed.fragment):
        raise ValueError("Feed contains an unexpected article URL")
    return url


def parse_feed(body, now):
    root = ET.fromstring(body)
    if root.tag != "rss" or root.findtext("channel/link", "").rstrip("/") != BLOG:
        raise ValueError("Not the canonical blog RSS feed")
    posts = {}
    for item in root.findall("channel/item"):
        url = post_url(item.findtext("link", ""))
        title = " ".join(item.findtext("title", "").split())
        if not title or len(title) > 300:
            raise ValueError("Invalid post title")
        published = parsedate_to_datetime(item.findtext("pubDate", ""))
        if published.tzinfo is None:
            raise ValueError("Post date has no timezone")
        if published > now:
            continue
        tags = [node.text.strip() for node in item.findall("category") if node.text]
        if len(tags) > 64 or any(len(tag) > 100 for tag in tags):
            raise ValueError("Invalid feed tags")
        if url in posts:
            raise ValueError("Duplicate article URL in RSS")
        posts[url] = {"url": url, "title": title, "tags": tags, "published": published}
    return sorted(posts.values(), key=lambda p: (p["published"], p["url"]))


class ArticlePage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonicals = []
        self.article = False
        self.in_title = False
        self.title = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and "canonical" in attrs.get("rel", "").split():
            self.canonicals.append(attrs.get("href"))
        if tag == "article":
            self.article = True
        if tag == "title":
            self.in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


def is_live(http, post):
    try:
        kind, body = http.request(post["url"])
    except RemoteError as exc:
        if exc.status in (403, 404, 502, 503, 504):
            return False
        raise
    page = ArticlePage()
    page.feed(body.decode("utf-8"))
    return (kind == "text/html" and page.article and page.canonicals == [post["url"]]
            and page.title.strip() == post["title"] + " — StarIntel Blog")


def select_phrase(post):
    seed = int(hashlib.sha256(post["url"].encode()).hexdigest()[:12], 16)
    result = subprocess.run(
        ["swipl", "-q", "-s", str(Path(__file__).resolve().parents[1] / "prolog/blog_phrases.pl"),
         "-g", "blog_phrases:main", "-t", "halt"],
        input=json.dumps({"tags": post["tags"], "seed": seed}), text=True,
        capture_output=True, check=True, timeout=10)
    return json.loads(result.stdout)["phrase"]


class ForgeState:
    def __init__(self, http, server, repo, token):
        if not re.fullmatch(r"https://[a-zA-Z0-9.-]+(?::[0-9]+)?", server):
            raise ValueError("Expected an HTTPS Forgejo server origin")
        if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo) or not token:
            raise ValueError("Missing repository or state-write token")
        self.http, self.token = http, token
        self.base = f"{server}/api/v1/repos/{repo}"
        self.sha = None

    def api(self, path, method="GET", data=None):
        _, body = self.http.request(self.base + path, method, data, self.token)
        return json.loads(body)

    def load(self):
        try:
            result = self.api(f"/contents/{STATE_FILE}?ref={STATE_BRANCH}")
        except RemoteError as exc:
            if exc.status != 404:
                raise
            # A missing branch and a missing file are distinct from denied access.
            try:
                self.api(f"/branches/{STATE_BRANCH}")
            except RemoteError as branch_exc:
                if branch_exc.status != 404:
                    raise
                self.api("/branches", "POST", {"new_branch_name": STATE_BRANCH,
                                               "old_ref_name": "main"})
            return {"version": 1, "posts": {}}
        self.sha = result["sha"]
        state = json.loads(base64.b64decode(result["content"]))
        if state.get("version") != 1 or not isinstance(state.get("posts"), dict):
            raise ValueError("Unknown announcement state format")
        for url, entry in state["posts"].items():
            post_url(url)
            if entry.get("status") not in ("pending", "sent"):
                raise ValueError("Invalid announcement state entry")
        return state

    def save(self, state):
        payload = {"branch": STATE_BRANCH, "message": "Record blog announcement delivery state",
                   "content": base64.b64encode((json.dumps(state, indent=2) + "\n").encode()).decode()}
        if self.sha:
            payload["sha"] = self.sha
        result = self.api(f"/contents/{STATE_FILE}", "PUT" if self.sha else "POST", payload)
        self.sha = result["content"]["sha"]


def announce(http, store, webhook, now, phrase_selector=select_phrase, limit=3):
    if not re.fullmatch(r"https://discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+", webhook):
        raise ValueError("Expected a Discord webhook URL")
    try:
        kind, body = http.request(BLOG + "/feed.xml")
    except RemoteError as exc:
        if exc.status in (403, 404, 502, 503, 504):
            print(f"Blog not live yet (HTTP {exc.status}); no announcements")
            return 0
        raise
    if kind not in ("application/rss+xml", "application/xml", "text/xml"):
        raise ValueError("Live feed did not return XML")
    posts = parse_feed(body, now)
    state = store.load()
    if any(p["status"] == "pending" for p in state["posts"].values()):
        raise RuntimeError("Pending delivery needs operator reconciliation; refusing duplicate sends")
    count = 0
    for post in posts:
        if post["url"] in state["posts"] or not is_live(http, post):
            continue
        phrase = phrase_selector(post)
        title = re.sub(r"([\\`*_{}\[\]()<>~|])", r"\\\1", post["title"])
        payload = {"username": "starintel", "avatar_url": AVATAR,
                   "allowed_mentions": {"parse": []},
                   "content": f"**New Blog Post**\n{phrase}\n**{title}**\n<{post['url']}>"}
        if len(payload["content"]) > 2000:
            raise ValueError("Announcement exceeds Discord message limit")
        entry = {"status": "pending", "title": post["title"], "phrase": phrase,
                 "reserved_at": now.isoformat()}
        state["posts"][post["url"]] = entry
        store.save(state)  # Optimistic SHA check/reservation must succeed before sending.
        _, response = http.request(webhook + "?wait=true", "POST", payload)
        message_id = str(json.loads(response)["id"])
        if not re.fullmatch(r"[0-9]+", message_id):
            raise ValueError("Discord did not confirm a message ID")
        entry.update(status="sent", message_id=message_id)
        store.save(state)
        count += 1
        print(f"Announced {post['url']}")
        if count >= limit:
            break
    print(f"Confirmed {count} new blog announcement(s)")
    return count


def main():
    http = HTTP()
    store = ForgeState(http, os.environ["FORGEJO_SERVER_URL"],
                       os.environ["FORGEJO_REPOSITORY"], os.environ["FORGEJO_TOKEN"])
    announce(http, store, os.environ["BLOG_DISCORD_WEBHOOK"], datetime.now(timezone.utc))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Do not print request objects, response bodies, environment values or webhook URLs.
        detail = str(exc) if type(exc) in (RemoteError, RuntimeError) else type(exc).__name__
        print(f"Blog announcement stopped safely: {detail}", file=sys.stderr)
        sys.exit(1)
