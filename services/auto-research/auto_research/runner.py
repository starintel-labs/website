from __future__ import annotations

import os
import subprocess
from pathlib import Path

from .config import Settings
from .store import RunStore


class HarnessError(RuntimeError):
    pass


class HarnessRunner:
    def __init__(self, settings: Settings, store: RunStore) -> None:
        self.settings = settings
        self.store = store
        self.harness = Path(__file__).resolve().parents[1] / "prolog" / "harness.pl"
        self.prompt = Path(__file__).resolve().parents[1] / "prompts" / "direct.md"

    def run(self, run_id: str) -> str:
        record = self.store.get(run_id)
        run_dir = self.store.run_dir(run_id).resolve()
        command = [
            self.settings.swipl,
            "-q",
            "-s",
            str(self.harness),
            "--",
            "--run-dir",
            str(run_dir),
            "--prolog-rlm-root",
            str(self.settings.prolog_rlm_root.resolve()),
            "--model",
            record.model,
            "--prompt-file",
            str(self.prompt),
        ]
        env = os.environ.copy()
        completed = subprocess.run(
            command,
            cwd=run_dir,
            env=env,
            text=True,
            capture_output=True,
            timeout=900,
            check=False,
        )
        (run_dir / "harness.stdout.log").write_text(completed.stdout, encoding="utf-8")
        (run_dir / "harness.stderr.log").write_text(completed.stderr, encoding="utf-8")
        if completed.returncode != 0:
            raise HarnessError(
                f"Prolog-RLM harness exited {completed.returncode}: {completed.stderr[-2000:]}"
            )
        result_path = run_dir / "result.json"
        if not result_path.is_file():
            raise HarnessError("Prolog-RLM harness returned success without result.json")
        return result_path.read_text(encoding="utf-8")
