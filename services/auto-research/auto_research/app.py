from __future__ import annotations

import asyncio
import hmac
import os
from collections.abc import Awaitable, Callable

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from .config import Settings
from .forgejo import ForgejoClient, ForgejoError
from .models import ForgejoIssueCreate, IssueRef, RunCreate, RunRecord
from .runner import HarnessRunner
from .store import RunStore

ForgejoFactory = Callable[[str, str], ForgejoClient]


def _default_forgejo_factory(base_url: str, token: str) -> ForgejoClient:
    return ForgejoClient(base_url, token)


def create_app(
    settings: Settings | None = None,
    *,
    forgejo_factory: ForgejoFactory = _default_forgejo_factory,
) -> FastAPI:
    config = settings or Settings.from_env()
    app = FastAPI(title="StarIntel Auto Research", version="0.1.0")
    app.state.settings = config
    app.state.store = RunStore(config.run_root)
    app.state.runner = HarnessRunner(config, app.state.store)
    app.state.forgejo_factory = forgejo_factory
    app.state.tasks = set()

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz")
    async def readyz(request: Request) -> JSONResponse:
        checks = request.app.state.settings.readiness()
        ready = all(checks.values())
        return JSONResponse(
            status_code=200 if ready else 503,
            content={"status": "ready" if ready else "not_ready", "checks": checks},
        )

    @app.get("/v1/runs", dependencies=[Depends(require_auth)])
    async def list_runs(request: Request) -> dict[str, list[dict[str, object]]]:
        records = request.app.state.store.list()
        return {"runs": [record.model_dump() for record in records]}

    @app.get("/v1/runs/{run_id}", dependencies=[Depends(require_auth)])
    async def get_run(run_id: str, request: Request) -> dict[str, object]:
        try:
            return request.app.state.store.get(run_id).model_dump()
        except (KeyError, ValueError):
            raise HTTPException(status_code=404, detail="run not found") from None

    @app.post("/v1/runs", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(require_auth)])
    async def create_run(payload: RunCreate, request: Request) -> dict[str, object]:
        config: Settings = request.app.state.settings
        if not config.model and not payload.model:
            raise HTTPException(status_code=503, detail="AUTO_RESEARCH_MODEL is not configured")
        if not config.forgejo_base_url or not config.forgejo_token:
            raise HTTPException(status_code=503, detail="Forgejo is not configured")

        model = payload.model or config.model
        record = RunRecord.new(payload, model)
        store: RunStore = request.app.state.store
        store.create(record)

        issues: list[IssueRef] = []
        forgejo = request.app.state.forgejo_factory(config.forgejo_base_url, config.forgejo_token)
        try:
            for project in payload.projects:
                title = f"[auto-research] {payload.title}: {project.name}"
                body = _project_issue_body(record.run_id, payload, project.name, project.brief)
                created = await forgejo.create_issue(project.repo, title, body)
                issues.append(
                    IssueRef(
                        project=project.name,
                        repo=project.repo,
                        number=int(created["number"]),
                        url=_optional_string(created.get("html_url")),
                    )
                )
        except (ForgejoError, ValueError) as exc:
            failed = store.update(
                record.run_id,
                state="issue_seed_failed",
                issues=issues,
                error=str(exc),
            )
            raise HTTPException(status_code=502, detail=failed.model_dump()) from exc

        record = store.update(record.run_id, state="queued", issues=issues)
        store.write_json(record.run_id, "request.json", record.model_dump())
        if config.runner_enabled:
            _spawn_run_task(request.app, record.run_id)
        return record.model_dump()

    @app.post("/v1/tools/forgejo/issues", dependencies=[Depends(require_auth)])
    async def create_forgejo_issue(payload: ForgejoIssueCreate, request: Request) -> dict[str, object]:
        config: Settings = request.app.state.settings
        if not config.forgejo_base_url or not config.forgejo_token:
            raise HTTPException(status_code=503, detail="Forgejo is not configured")
        forgejo = request.app.state.forgejo_factory(config.forgejo_base_url, config.forgejo_token)
        try:
            return await forgejo.create_issue(payload.repo, payload.title, payload.body)
        except (ForgejoError, ValueError) as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return app


async def require_auth(
    request: Request,
    authorization: str | None = Header(default=None),
) -> None:
    token = request.app.state.settings.api_token
    if not token:
        raise HTTPException(status_code=503, detail="AUTO_RESEARCH_API_TOKEN is not configured")
    if authorization is None:
        raise _unauthorized()
    scheme, separator, credential = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer":
        raise _unauthorized()
    if not hmac.compare_digest(credential, token):
        raise _unauthorized()


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid bearer token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _project_issue_body(run_id: str, payload: RunCreate, project_name: str, brief: str) -> str:
    sections = [
        f"<!-- auto-research-run:{run_id} -->",
        f"# Auto Research project: {project_name}",
        "",
        f"**Run:** `{run_id}`",
        "",
        "## Objective",
        payload.objective,
    ]
    if brief:
        sections.extend(["", "## Project brief", brief])
    sections.extend(
        [
            "",
            "## Runtime contract",
            "This issue was created by the StarIntel Auto Research service before the GLM direct harness starts.",
            "The model may write run artifacts through capability-gated native tools; symbolic planning is disabled for this slice.",
        ]
    )
    return "\n".join(sections) + "\n"


def _optional_string(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _spawn_run_task(app: FastAPI, run_id: str) -> None:
    task = asyncio.create_task(_execute_run(app, run_id), name=f"auto-research:{run_id}")
    app.state.tasks.add(task)
    task.add_done_callback(app.state.tasks.discard)


async def _execute_run(app: FastAPI, run_id: str) -> None:
    store: RunStore = app.state.store
    runner: HarnessRunner = app.state.runner
    store.update(run_id, state="running", error=None)
    try:
        result = await asyncio.to_thread(runner.run, run_id)
    except Exception as exc:
        store.update(run_id, state="failed", error=str(exc))
        return
    store.update(run_id, state="completed", result=result, error=None)


app = create_app()


def main() -> None:
    import uvicorn

    host = os.getenv("AUTO_RESEARCH_HOST", "127.0.0.1")
    port = int(os.getenv("AUTO_RESEARCH_PORT", "8097"))
    uvicorn.run("auto_research.app:app", host=host, port=port, reload=False)
