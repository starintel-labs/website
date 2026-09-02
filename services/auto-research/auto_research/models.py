from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


class ProjectSpec(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    repo: str = Field(min_length=3, max_length=240, description="Forgejo repository as owner/name")
    brief: str = Field(default="", max_length=20_000)

    @field_validator("repo")
    @classmethod
    def validate_repo(cls, value: str) -> str:
        owner, sep, repo = value.partition("/")
        if not sep or not owner or not repo or "/" in repo:
            raise ValueError("repo must be exactly owner/name")
        return value


class RunCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    objective: str = Field(min_length=1, max_length=50_000)
    projects: list[ProjectSpec] = Field(min_length=1, max_length=64)
    model: str | None = Field(default=None, max_length=200)


class ForgejoIssueCreate(BaseModel):
    repo: str = Field(min_length=3, max_length=240)
    title: str = Field(min_length=1, max_length=255)
    body: str = Field(default="", max_length=100_000)

    @field_validator("repo")
    @classmethod
    def validate_repo(cls, value: str) -> str:
        owner, sep, repo = value.partition("/")
        if not sep or not owner or not repo or "/" in repo:
            raise ValueError("repo must be exactly owner/name")
        return value


class IssueRef(BaseModel):
    project: str
    repo: str
    number: int
    url: str | None = None


RunState = Literal[
    "seeding_issues",
    "queued",
    "running",
    "completed",
    "failed",
    "issue_seed_failed",
]


class RunRecord(BaseModel):
    run_id: str
    title: str
    objective: str
    projects: list[ProjectSpec]
    model: str
    state: RunState
    issues: list[IssueRef] = Field(default_factory=list)
    result: str | None = None
    error: str | None = None
    created_at: str
    updated_at: str

    @classmethod
    def new(cls, request: RunCreate, model: str) -> "RunRecord":
        now = datetime.now(timezone.utc).isoformat()
        return cls(
            run_id=f"ar-{uuid4().hex[:16]}",
            title=request.title,
            objective=request.objective,
            projects=request.projects,
            model=model,
            state="seeding_issues",
            created_at=now,
            updated_at=now,
        )
