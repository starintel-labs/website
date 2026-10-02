import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "./main.ts";
import { loadConfig } from "./config.ts";

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  const cfg = loadConfig({
    HOST: "127.0.0.1",
    PORT: "0",
    STATIC_DIR: "dist",
    AUTO_RESEARCH_URL: "",
    RABBIT_URL: "",
  });
  const app = createApp(cfg);
  const server = createServer(app.handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("clean MPA routes resolve generated HTML", async () => {
  await withServer(async (base) => {
    const research = await fetch(`${base}/research`);
    assert.equal(research.status, 200);
    assert.match(await research.text(), /StarIntel Research/);

    const radar = await fetch(`${base}/radar`);
    assert.equal(radar.status, 200);
    assert.match(await radar.text(), /radar/i);

    const wardrive = await fetch(`${base}/wardrive`);
    assert.equal(wardrive.status, 200);
    assert.match(await wardrive.text(), /Score the run/i);
  });
});

test("research health projection is GET-only and fails closed when unconfigured", async () => {
  await withServer(async (base) => {
    const get = await fetch(`${base}/api/research/status`);
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), { configured: false, status: "off" });

    const post = await fetch(`${base}/api/research/status`, { method: "POST" });
    assert.equal(post.status, 405);
  });
});


test("Wardrive API is scoped to Wardrive hostnames", async () => {
  await withServer(async (base) => {
    const apex = await fetch(`${base}/api/wardrive/status`);
    assert.equal(apex.status, 404);

    const wardrive = await fetch(`${base}/api/wardrive/status`, {
      headers: { host: "wardrive.starintel.actor" },
    });
    assert.equal(wardrive.status, 200);
    assert.deepEqual(await wardrive.json(), {
      configured: false,
      storage: "off",
      profile: "srr/0.2",
    });
  });
});
