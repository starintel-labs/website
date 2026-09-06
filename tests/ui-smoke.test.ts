/**
 * UI smoke tests: run the REAL built main app and verify the page in a real
 * browser (Playwright/Chromium).
 *
 * Skipped automatically when playwright or a chromium build is unavailable
 * (e.g. CI containers without browsers). Run locally with:
 *
 *   pnpm build:main && node --experimental-strip-types --test tests/ui-smoke.test.ts
 *
 * Verifies: homepage loads, no unexpected console errors, no horizontal
 * overflow, navigation exists, hero exists, expected sections exist,
 * mobile viewport transforms.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distIndex = join(root, "apps", "main", "dist", "index.html");
const serverMain = join(root, "apps", "main", "server", "main.ts");

let playwright: unknown = null;
let browserAvailable = false;
try {
  playwright = (await import("playwright")).chromium;
  browserAvailable = true;
} catch {
  browserAvailable = false;
}

const canRun = browserAvailable && existsSync(distIndex) && existsSync(serverMain);

interface Handle {
  port: number;
  stop: () => Promise<void>;
}

async function startServer(): Promise<Handle> {
  const port = 18900 + Math.floor(Math.random() * 500);
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", serverMain],
    {
      // The server resolves staticDir from its own module location
      // (apps/main/dist); only the port needs overriding.
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
      stdio: "ignore",
    },
  );
  // wait for readiness
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return {
    port,
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 150));
    },
  };
}

test("main site ui smoke", { skip: !canRun && "playwright/chromium or built dist unavailable" }, async (t) => {
  const chromium = playwright as { launch(o?: unknown): Promise<unknown> };
  const server = await startServer();
  const base = `http://127.0.0.1:${server.port}`;
  t.after(async () => {
    await server.stop();
  });

  const browser = (await chromium.launch()) as {
    newPage(o: unknown): Promise<any>;
    close(): Promise<void>;
  };
  t.after(async () => {
    await browser.close();
  });

  // ---- desktop viewport ----
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors: string[] = [];
  page.on("console", (msg: any) => {
    // the 503 from the unprovisioned projection API is expected locally;
    // anything else is a regression.
    if (msg.type() === "error" && !msg.text().includes("503")) {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err: Error) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto(`${base}/`, { waitUntil: "networkidle" });

  const overflowDesktop = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  assert.equal(overflowDesktop, false, "horizontal overflow at 1440x900");

  assert.ok(await page.locator(".si-topbar__nav a").count() >= 5, "primary navigation exists");
  assert.ok(await page.locator(".si-hero").count() === 1, "hero exists");
  assert.ok(await page.locator("#capabilities .si-card").count() >= 4, "capability band renders");
  assert.ok(await page.locator("#recent").count() === 1, "recent documents section exists");
  assert.ok(await page.locator("text=How content moves").count() >= 1, "pipeline section exists");
  assert.ok(await page.locator(".si-footer").count() === 1, "footer exists");

  const theme = await page.evaluate(() => document.documentElement.dataset["siTheme"]);
  assert.equal(theme, "obsidian-gold", "obsidian-gold theme attribute set");

  assert.deepEqual(consoleErrors, [], "no unexpected console errors");
  await page.close();

  // ---- mobile viewport: genuine layout transformation ----
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${base}/`, { waitUntil: "networkidle" });
  const overflowMobile = await mobile.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  assert.equal(overflowMobile, false, "horizontal overflow at 390x844");
  const navWrapped = await mobile.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(".si-topbar__nav");
    return nav !== null && getComputedStyle(nav).flexWrap === "wrap";
  });
  assert.equal(navWrapped, true, "mobile nav wraps (layout transformation)");
  await mobile.close();
});
