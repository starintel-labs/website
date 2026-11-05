#!/usr/bin/env python3
"""Update/check the complete immutable StarLang consumer bundle; never generate wire semantics."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LOCK = Path("schema/starintel-schema.lock.json")
TOOL = Path("scripts/vendor/starintel-sync.py")
TOOL_LOCK = Path("schema/starintel-sync-tool.lock.json")
UPSTREAM_TOOL = "tools/sync-starintel-consumer.py"
REPOSITORY = "https://git.starintel.actor/nsaspy/star-lang.git"


def run(*argv, cwd=ROOT):
    return subprocess.check_output(argv, cwd=cwd).decode().strip()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def tool_check(root=None):
    root = root or ROOT
    lock = json.loads((root / LOCK).read_text())
    metadata = json.loads((root / TOOL_LOCK).read_text())
    if metadata["canonical_commit"] != lock["canonical_commit"]:
        raise ValueError("sync tool and bundle must use the same immutable authority commit")
    if metadata["source"] != UPSTREAM_TOOL or sha((root / TOOL).read_bytes()) != metadata["sha256"]:
        raise ValueError("vendored authority sync tool hash mismatch")
    return lock


def check(offline, source=None):
    lock = tool_check()
    args = [sys.executable, str(ROOT / TOOL), "--lock", str(ROOT / LOCK)]
    if offline:
        args.append("--offline")
    else:
        upstream = subprocess.check_output(["git", "-C", str(source), "show", f"{lock['canonical_commit']}:{UPSTREAM_TOOL}"])
        if upstream != (ROOT / TOOL).read_bytes():
            raise ValueError("sync tool differs from the exact upstream commit")
        args += ["--source", str(source)]
    subprocess.run(args, cwd=ROOT, check=True)


def update(commit, source):
    if (ROOT / LOCK).exists():
        check(True)
    tool = subprocess.check_output(["git", "-C", str(source), "show", f"{commit}:{UPSTREAM_TOOL}"])
    with tempfile.TemporaryDirectory(prefix="starintel-pin-") as tmp:
        stage = Path(tmp)
        staged_tool = stage / "sync.py"
        staged_tool.write_bytes(tool)
        subprocess.run([
            sys.executable, str(staged_tool), "--lock", str(stage / LOCK),
            "--commit", commit, "--source", str(source), "--bundle", "--destination", "schema/starintel",
        ], cwd=stage, check=True)
        new = json.loads((stage / LOCK).read_text())
        old = json.loads((ROOT / LOCK).read_text()) if (ROOT / LOCK).exists() else {}
        old_tool = (ROOT / TOOL).read_bytes() if (ROOT / TOOL).exists() else None
        # Unrelated upstream commits must not create daily pin-only churn.
        if old_tool == tool and {k: v for k, v in old.items() if k != "canonical_commit"} == {k: v for k, v in new.items() if k != "canonical_commit"}:
            print("StarIntel bundle is already current; no files changed")
            return
        for relative in old.get("vendored_files", {}):
            if relative not in new["vendored_files"]:
                (ROOT / relative).unlink()
        for relative in [*new["vendored_files"], str(LOCK)]:
            target = ROOT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((stage / relative).read_bytes())
        (ROOT / TOOL).parent.mkdir(parents=True, exist_ok=True)
        (ROOT / TOOL).write_bytes(tool)
        (ROOT / TOOL_LOCK).write_text(json.dumps({
            "canonical_commit": commit, "source": UPSTREAM_TOOL, "sha256": sha(tool),
        }, indent=2) + "\n")
    check(False, source)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "update"])
    parser.add_argument("--offline", action="store_true", help="check the complete local closure without network access")
    parser.add_argument("--source", type=Path, help="existing canonical Git checkout; read committed objects, never its worktree")
    parser.add_argument("--commit", help="exact 40-character upstream SHA")
    parser.add_argument("--ref", default="main", help="upstream branch to resolve once for an update")
    parser.add_argument("--repository", default=os.environ.get("STARINTEL_CANONICAL_REPO", REPOSITORY))
    args = parser.parse_args()
    if args.offline:
        if args.command != "check" or args.source or args.commit:
            parser.error("--offline is only valid for a local check")
        check(True)
        return
    with tempfile.TemporaryDirectory(prefix="starintel-authority-") as tmp:
        source = args.source.resolve() if args.source else Path(tmp)
        commit = args.commit
        if args.command == "check":
            commit = tool_check()["canonical_commit"]
        elif commit is None:
            commit = run("git", "ls-remote", args.repository, f"refs/heads/{args.ref}").split()[0]
        if not commit or not re.fullmatch(r"[a-f0-9]{40}", commit):
            parser.error("a full immutable upstream SHA is required")
        if not args.source:
            run("git", "init", "--quiet", str(source))
            run("git", "fetch", "--quiet", "--depth=1", args.repository, commit, cwd=source)
        if args.command == "update":
            update(commit, source)
        else:
            check(False, source)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, IndexError, subprocess.CalledProcessError) as error:
        sys.exit(f"StarIntel pin failed closed: {error}")
