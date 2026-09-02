from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any

from .models import RunRecord


class RunStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()

    def run_dir(self, run_id: str) -> Path:
        if not run_id.startswith("ar-") or any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-" for ch in run_id):
            raise ValueError("invalid run id")
        return self.root / run_id

    def create(self, record: RunRecord) -> RunRecord:
        with self._lock:
            run_dir = self.run_dir(record.run_id)
            run_dir.mkdir(mode=0o700, parents=False, exist_ok=False)
            (run_dir / "workspace").mkdir(mode=0o700)
            self._write_record(record)
            self.write_json(record.run_id, "request.json", record.model_dump())
            return record

    def get(self, run_id: str) -> RunRecord:
        path = self.run_dir(run_id) / "run.json"
        if not path.is_file():
            raise KeyError(run_id)
        return RunRecord.model_validate_json(path.read_text(encoding="utf-8"))

    def list(self) -> list[RunRecord]:
        records: list[RunRecord] = []
        for path in sorted(self.root.glob("ar-*/run.json"), reverse=True):
            try:
                records.append(RunRecord.model_validate_json(path.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                continue
        return records

    def update(self, run_id: str, **changes: Any) -> RunRecord:
        with self._lock:
            current = self.get(run_id)
            changes["updated_at"] = datetime.now(timezone.utc).isoformat()
            updated = current.model_copy(update=changes)
            self._write_record(updated)
            return updated

    def write_json(self, run_id: str, name: str, value: Any) -> None:
        if "/" in name or name.startswith("."):
            raise ValueError("invalid run artifact name")
        path = self.run_dir(run_id) / name
        data = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        self._atomic_write(path, data)

    def _write_record(self, record: RunRecord) -> None:
        path = self.run_dir(record.run_id) / "run.json"
        data = record.model_dump_json(indent=2) + "\n"
        self._atomic_write(path, data)

    @staticmethod
    def _atomic_write(path: Path, data: str) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(data, encoding="utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
