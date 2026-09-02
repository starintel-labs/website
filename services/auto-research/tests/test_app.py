from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from auto_research.app import create_app
from auto_research.config import Settings


class FakeForgejo:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str]] = []

    async def create_issue(self, repo: str, title: str, body: str) -> dict[str, object]:
        self.calls.append((repo, title, body))
        number = len(self.calls)
        return {"number": number, "html_url": f"https://forgejo.invalid/{repo}/issues/{number}"}


def settings(tmp_path: Path) -> Settings:
    return Settings(
        api_token="test-api-token",
        forgejo_base_url="https://forgejo.invalid",
        forgejo_token="test-forgejo-token",
        run_root=tmp_path / "runs",
        prolog_rlm_root=tmp_path,
        model="z-ai/glm-test",
        runner_enabled=False,
    )


def auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-api-token"}


def test_run_endpoints_require_bearer_auth(tmp_path: Path) -> None:
    app = create_app(settings(tmp_path))
    with TestClient(app) as client:
        response = client.get("/v1/runs")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_create_run_seeds_one_forgejo_issue_per_project(tmp_path: Path) -> None:
    fake = FakeForgejo()
    app = create_app(settings(tmp_path), forgejo_factory=lambda _base, _token: fake)
    payload = {
        "title": "Migrate Auto Research",
        "objective": "Stand up the first direct-mode research slice.",
        "projects": [
            {"name": "website", "repo": "starintel-labs/website", "brief": "HTTP service"},
            {"name": "prolog-rlm", "repo": "lost-rob0t/prolog-rlm", "brief": "direct harness"},
        ],
    }

    with TestClient(app) as client:
        response = client.post("/v1/runs", headers=auth(), json=payload)
        assert response.status_code == 202
        record = response.json()
        fetched = client.get(f"/v1/runs/{record['run_id']}", headers=auth())

    assert record["state"] == "queued"
    assert len(record["issues"]) == 2
    assert [call[0] for call in fake.calls] == [
        "starintel-labs/website",
        "lost-rob0t/prolog-rlm",
    ]
    assert all(record["run_id"] in call[2] for call in fake.calls)
    assert fetched.status_code == 200
    run_dir = settings(tmp_path).run_root / record["run_id"]
    assert (run_dir / "run.json").is_file()
    assert (run_dir / "request.json").is_file()
    assert (run_dir / "workspace").is_dir()


def test_authenticated_forgejo_tool_endpoint(tmp_path: Path) -> None:
    fake = FakeForgejo()
    app = create_app(settings(tmp_path), forgejo_factory=lambda _base, _token: fake)
    with TestClient(app) as client:
        response = client.post(
            "/v1/tools/forgejo/issues",
            headers=auth(),
            json={"repo": "starintel-labs/website", "title": "extra slice", "body": "details"},
        )
    assert response.status_code == 200
    assert response.json()["number"] == 1
    assert fake.calls == [("starintel-labs/website", "extra slice", "details")]
