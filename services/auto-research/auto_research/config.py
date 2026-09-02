from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True, slots=True)
class Settings:
    api_token: str
    forgejo_base_url: str
    forgejo_token: str
    run_root: Path
    prolog_rlm_root: Path
    model: str
    swipl: str = "swipl"
    runner_enabled: bool = True

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            api_token=os.getenv("AUTO_RESEARCH_API_TOKEN", "").strip(),
            forgejo_base_url=os.getenv("FORGEJO_BASE_URL", "").rstrip("/"),
            forgejo_token=os.getenv("FORGEJO_TOKEN", "").strip(),
            run_root=Path(os.getenv("AUTO_RESEARCH_RUN_ROOT", "var/auto-research")).expanduser(),
            prolog_rlm_root=Path(os.getenv("PROLOG_RLM_ROOT", "../prolog-rlm")).expanduser(),
            model=os.getenv("AUTO_RESEARCH_MODEL", "").strip(),
            swipl=os.getenv("SWIPL", "swipl").strip() or "swipl",
            runner_enabled=_env_bool("AUTO_RESEARCH_RUNNER_ENABLED", True),
        )

    def readiness(self) -> dict[str, bool]:
        return {
            "api_token": bool(self.api_token),
            "forgejo": bool(self.forgejo_base_url and self.forgejo_token),
            "model": bool(self.model),
            "prolog_rlm_root": self.prolog_rlm_root.is_dir(),
        }
