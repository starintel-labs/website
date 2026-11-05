"""Built-app browser regression. Run with Playwright installed; accepts PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH."""
import asyncio
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import time
import urllib.request

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(os.environ.get("BROWSER_ARTIFACTS", "/tmp/opencode/radar-redesign"))
INITIAL = [
    {"id": "archive-1", "dtype": "document", "dataset": "public-research", "title": "A new window into the public record", "summary": "A community archive makes its research collection available to everyone.\n\nThe document is the story—not a dot on a radar screen.", "updatedAt": "2026-11-05T10:04:00Z", "url": "https://example.org/archive", "fields": [{"label": "Tags", "value": "archives, open research"}]},
    {"id": "person-1", "dtype": "person", "dataset": "computing-history", "title": "Ada Lovelace", "summary": "Notes on the Analytical Engine, and the history of a remarkable idea.", "updatedAt": "2026-11-05T10:03:00Z", "fields": []},
    {"id": "post-1", "dtype": "social-media-post", "dataset": "public-discussion", "title": "fieldnotes", "summary": "Public evidence is more useful when you can read it in context.", "updatedAt": "2026-11-05T10:02:00Z", "fields": [{"label": "Platform", "value": "example"}, {"label": "Username", "value": "fieldnotes"}]},
    {"id": "hostile-1", "dtype": "document", "dataset": "security-fixture", "title": '<img src=x onerror="window.pwned=true">', "summary": "<script>window.pwned=true</script>", "fields": []},
]


async def main():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    server = subprocess.Popen(["node", "--experimental-strip-types", "apps/main/server/main.ts"], cwd=ROOT,
        env={**os.environ, "HOST": "127.0.0.1", "PORT": str(port), "RABBIT_URL": ""}, stdout=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz", timeout=1)
                break
            except OSError:
                await asyncio.sleep(0.1)
        else:
            raise AssertionError("built server did not start")
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        async with async_playwright() as playwright:
            options = {"headless": True, "args": ["--no-sandbox"]}
            if os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"):
                options["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
            browser = await playwright.chromium.launch(**options)
            errors = []

            async def setup(page, *, failure=False, stale=False):
                state = {"failure": failure, "stale": stale, "round": 0}
                page.on("pageerror", lambda error: errors.append(str(error)))

                async def snapshot(route):
                    if state["failure"]:
                        await route.fulfill(status=503, content_type="application/json", body='{"error":"projection unavailable"}')
                    else:
                        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"documents": INITIAL, "window": 4, "stale": state["stale"]}))

                async def stream(route):
                    aggregate = "scope=aggregate" in route.request.url
                    total = 120 if aggregate else 7
                    family = "actor" if aggregate else "document"
                    frame = {"type": "rate", "rps": 12 if aggregate else 0.7, "total": total, "families": {family: total}, "sizes": {"s": total}}
                    body = "retry: 2500\n\ndata: " + json.dumps(frame) + "\n\n"
                    if not aggregate:
                        state["round"] += 1
                        number = state["round"]
                        docs = INITIAL
                        removed = []
                        if number == 2:
                            docs = [{"id": f"new-{i}", "dtype": "document", "dataset": "live-fixture", "title": f"New record {i}", "summary": "An incoming public record.", "fields": []} for i in reversed(range(150))]
                        elif number == 3:
                            docs = []
                            removed = ["new-149"]
                        body += "event: documents\ndata: " + json.dumps({"documents": docs, "removed": removed}) + "\n\n"
                    await route.fulfill(status=200, content_type="text/event-stream", body=body)

                await page.route("**/api/recent-documents?*", snapshot)
                await page.route("**/radar/stream?scope=*", stream)
                return state

            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            await setup(page)
            await page.goto(f"http://127.0.0.1:{port}/radar")
            await expect(page.locator(".document-row")).to_have_count(4)
            await page.get_by_role("button", name="Pause feed", exact=True).click()
            await page.locator("#radar-search").fill("Lovelace")
            await expect(page.locator(".document-row")).to_have_count(1)
            await page.locator(".document-row").click()
            await expect(page.locator("#radar-reader h2")).to_have_text("Ada Lovelace")
            await page.locator("#radar-search").fill("")
            await page.select_option("#radar-type", "social-media-post")
            await expect(page.locator(".document-row")).to_have_count(1)
            await page.select_option("#radar-type", "")
            await page.get_by_role("button", name=re.compile("A new window")).click()
            await expect(page.locator("#radar-reader")).to_contain_text("The document is the story")
            await expect(page.locator(".document-reader__source")).to_have_attribute("href", "https://example.org/archive")
            await page.screenshot(path=str(ARTIFACTS / "radar-desktop.png"), full_page=True)
            await page.get_by_role("button", name=re.compile("<img src=x")).click()
            assert await page.locator("#radar-reader img, #radar-reader script").count() == 0
            assert await page.evaluate("() => window.pwned") is None
            await expect(page.locator("#radar-pause")).to_contain_text("150 updates", timeout=7000)
            await expect(page.locator(".document-row")).to_have_count(4)
            await page.locator("#radar-pause").click()
            await expect(page.locator(".document-row")).to_have_count(100)
            await page.get_by_role("button", name=re.compile("New record 149")).click()
            await expect(page.locator("#radar-reader h2")).to_have_text("New record 149")
            await page.get_by_role("button", name="Pause feed", exact=True).click()
            await expect(page.get_by_role("button", name=re.compile("New record 149"))).to_have_count(0, timeout=7000)
            await expect(page.locator("#radar-reader h2")).not_to_have_text("New record 149")
            await page.select_option("#radar-scope", "aggregate")
            await expect(page.locator("#radar-aggregate")).to_be_visible()
            await expect(page.locator("#radar-public")).to_be_hidden()
            await expect(page.locator("#document-feed > li")).to_have_count(0)
            await expect(page.locator("#radar-total")).to_have_text("120 events observed")
            await page.select_option("#radar-scope", "public")
            await expect(page.locator(".document-row")).to_have_count(4)
            await expect(page.locator("#radar-total")).to_have_text("7 events observed")
            assert not await page.evaluate("() => document.documentElement.scrollWidth > innerWidth")
            await page.close()

            home = await browser.new_page()
            state = await setup(home, failure=True)
            await home.goto(f"http://127.0.0.1:{port}/")
            await expect(home.get_by_role("button", name="Retry snapshot")).to_be_visible()
            state["failure"] = False
            state["stale"] = True
            await home.get_by_role("button", name="Retry snapshot").click()
            await expect(home.locator(".public-document-card")).to_have_count(4)
            await expect(home.locator("#recent-note")).to_contain_text("cached")
            await expect(home.locator(".public-document-card a").first).to_have_attribute("href", "/radar#document=archive-1")
            await home.screenshot(path=str(ARTIFACTS / "homepage-corpus.png"), full_page=True)
            await home.close()

            race = await browser.new_page()
            race.on("pageerror", lambda error: errors.append(str(error)))
            old = [{**INITIAL[0], "id": "revoked", "title": "Do not resurrect"}, {**INITIAL[0], "id": "updated", "title": "Old version"}, {**INITIAL[0], "id": "bootstrap", "title": "Historical corpus record"}]
            async def late_snapshot(route):
                await asyncio.sleep(0.3)
                await route.fulfill(status=200, content_type="application/json", body=json.dumps({"documents": old, "window": 3, "stale": False}))
            async def early_live(route):
                body = "retry: 30000\n\nevent: documents\ndata: " + json.dumps({"documents": [{**INITIAL[0], "id": "updated", "title": "New version"}], "removed": ["revoked"]}) + "\n\n"
                await route.fulfill(status=200, content_type="text/event-stream", body=body)
            await race.route("**/api/recent-documents?*", late_snapshot)
            await race.route("**/radar/stream?scope=*", early_live)
            await race.goto(f"http://127.0.0.1:{port}/radar")
            await expect(race.locator("#radar-snapshot-note")).to_have_text("Public corpus connected")
            await expect(race.locator(".document-row")).to_have_count(2)
            await expect(race.get_by_role("button", name=re.compile("New version"))).to_have_count(1)
            await expect(race.get_by_role("button", name=re.compile("Historical corpus record"))).to_have_count(1)
            await expect(race.get_by_role("button", name=re.compile("Do not resurrect|Old version"))).to_have_count(0)
            await race.close()

            standby = await browser.new_page()
            standby.on("pageerror", lambda error: errors.append(str(error)))
            await standby.route("**/api/recent-documents?*", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"documents": INITIAL, "window": 4, "stale": False})))
            await standby.goto(f"http://127.0.0.1:{port}/radar")
            await expect(standby.locator("#radar-status")).to_have_text("standby")
            await expect(standby.locator(".document-row")).to_have_count(4)
            await standby.close()

            mobile = await browser.new_page(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
            await setup(mobile)
            await mobile.goto(f"http://127.0.0.1:{port}/radar")
            await expect(mobile.locator(".document-row")).to_have_count(4)
            await mobile.get_by_role("button", name=re.compile("A new window")).click()
            await expect(mobile.locator("#radar-reader h2")).to_have_text("A new window into the public record")
            heading = await mobile.locator("#radar-reader h2").bounding_box()
            navigation = await mobile.locator(".si-topbar").bounding_box()
            assert heading["y"] >= navigation["y"] + navigation["height"], "sticky navigation must not cover the selected document"
            assert not await mobile.evaluate("() => document.documentElement.scrollWidth > innerWidth")
            await mobile.evaluate("() => scrollTo(0, 0)")
            await mobile.screenshot(path=str(ARTIFACTS / "radar-mobile.png"), full_page=True)
            await mobile.close()
            assert not errors, errors
            await browser.close()
            print("PASS: document feed/reader, filtering, pause/bounds, paused revocation, late snapshot races, scope isolation, XSS safety, homepage retry/cache, responsive layouts")
            print(f"Screenshots: {ARTIFACTS}")
    finally:
        server.terminate()
        server.wait(timeout=10)


if __name__ == "__main__":
    asyncio.run(main())
