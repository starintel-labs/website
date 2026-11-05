#!/usr/bin/env python3
"""Publish an already-tested pin update as one Forgejo PR; never merge or deploy."""
import base64
import json
import os
from pathlib import Path
import subprocess
import urllib.request


def main():
    paths = ["schema", "scripts/vendor/starintel-sync.py"]
    status = subprocess.check_output(["git", "status", "--porcelain", "--", *paths]).decode()
    if not status.strip():
        print("No StarIntel pin update to propose")
        return
    token = os.environ["FORGEJO_TOKEN"]
    repository = os.environ["FORGEJO_REPOSITORY"]
    server = os.environ.get("FORGEJO_SERVER_URL", "https://git.starintel.actor").rstrip("/")
    lock = json.loads(Path("schema/starintel-schema.lock.json").read_text())
    branch = "automation/starintel-pin-" + lock["canonical_commit"][:12]

    def api(path, data=None):
        request = urllib.request.Request(
            f"{server}/api/v1/repos/{repository}/{path}",
            data=None if data is None else json.dumps(data).encode(),
            headers={"Authorization": f"token {token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    for pull in api("pulls?state=open&limit=100"):
        if pull["head"]["ref"] == branch:
            print(f"Pin update already proposed: {pull['html_url']}")
            return
    subprocess.run(["git", "checkout", "-b", branch], check=True)
    subprocess.run(["git", "add", "--", *paths], check=True)
    subprocess.run(["git", "-c", "user.name=StarIntel pin bot", "-c", "user.email=pin-bot@starintel.actor", "commit", "-m", f"chore: update StarLang bundle to {lock['canonical_commit'][:12]}"], check=True)
    env = {**os.environ,
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": f"http.{server}/.extraheader",
        "GIT_CONFIG_VALUE_0": "Authorization: Basic " + base64.b64encode(f"oauth2:{token}".encode()).decode(),
    }
    subprocess.run(["git", "push", f"{server}/{repository}.git", f"HEAD:refs/heads/{branch}"], env=env, check=True)
    pull = api("pulls", {
        "head": branch, "base": "main",
        "title": f"chore: update StarIntel {lock['release_version']} authority pin",
        "body": f"Complete canonical bundle and sync tool pinned to `{lock['canonical_commit']}`. Local CI and exact-upstream verification passed before publication. No automatic merge or deployment.",
    })
    print(pull["html_url"])


if __name__ == "__main__":
    main()
