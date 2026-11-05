import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("starintel_pin", ROOT / "scripts/starintel-pin.py")
pin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pin)


class PinTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "consumer"
        shutil.copytree(ROOT / "schema", self.root / "schema")
        (self.root / pin.TOOL).parent.mkdir(parents=True)
        shutil.copyfile(ROOT / pin.TOOL, self.root / pin.TOOL)

    def test_complete_offline_closure(self):
        with patch.object(pin, "ROOT", self.root):
            pin.check(True)

    def test_tool_drift_fails_closed(self):
        with (self.root / pin.TOOL).open("a") as file:
            file.write("\n# tampered\n")
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            pin.tool_check(self.root)

    def test_artifact_drift_fails_closed(self):
        lock = json.loads((self.root / pin.LOCK).read_text())
        artifact = next(iter(lock["vendored_files"]))
        (self.root / artifact).write_text("tampered")
        with patch.object(pin, "ROOT", self.root), self.assertRaises(subprocess.CalledProcessError):
            pin.check(True)

    def test_tool_commit_must_match_bundle(self):
        metadata = json.loads((self.root / pin.TOOL_LOCK).read_text())
        metadata["canonical_commit"] = "0" * 40
        (self.root / pin.TOOL_LOCK).write_text(json.dumps(metadata))
        with self.assertRaisesRegex(ValueError, "same immutable"):
            pin.tool_check(self.root)

    def test_unchanged_upstream_release_is_a_noop(self):
        source = Path(self.tmp.name) / "authority"
        source.mkdir()
        lock = json.loads((self.root / pin.LOCK).read_text())
        for local, entry in lock["vendored_files"].items():
            target = source / entry["source"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(self.root / local, target)
        tool = source / pin.UPSTREAM_TOOL
        tool.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self.root / pin.TOOL, tool)
        for args in [
            ["init", "--quiet"], ["add", "."],
            ["-c", "user.name=Pin Test", "-c", "user.email=pin-test@example.invalid", "commit", "--quiet", "-m", "fixture"],
        ]:
            subprocess.run(["git", *args], cwd=source, check=True)
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source).decode().strip()
        before = (self.root / pin.LOCK).read_bytes()
        with patch.object(pin, "ROOT", self.root), contextlib.redirect_stdout(io.StringIO()) as output:
            pin.update(commit, source)
        self.assertIn("no files changed", output.getvalue())
        self.assertEqual(before, (self.root / pin.LOCK).read_bytes())


if __name__ == "__main__":
    unittest.main()
