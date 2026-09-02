from __future__ import annotations

from urllib.parse import quote

import httpx


class ForgejoError(RuntimeError):
    pass


class ForgejoClient:
    def __init__(self, base_url: str, token: str, *, timeout: float = 20.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    async def create_issue(self, repo: str, title: str, body: str) -> dict[str, object]:
        owner, sep, name = repo.partition("/")
        if not sep or not owner or not name or "/" in name:
            raise ValueError("repo must be exactly owner/name")
        url = f"{self.base_url}/api/v1/repos/{quote(owner, safe='')}/{quote(name, safe='')}/issues"
        headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, headers=headers, json={"title": title, "body": body})
        if response.status_code not in {200, 201}:
            detail = response.text[:1000]
            raise ForgejoError(f"Forgejo issue create failed: HTTP {response.status_code}: {detail}")
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("number"), int):
            raise ForgejoError("Forgejo returned an invalid issue payload")
        return payload
