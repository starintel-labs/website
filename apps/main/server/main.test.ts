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
    NAVIDROME_URL: "",
    NAVIDROME_USER: "",
    NAVIDROME_PASSWORD: "",
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


test("radar music fails closed when Navidrome is unconfigured", async () => {
  await withServer(async (base) => {
    const status = await fetch(`${base}/api/radar/music/status`);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), {
      configured: false,
      status: "off",
      playlist: "Dark Synthwave",
    });

    const stream = await fetch(`${base}/radar/music/stream`);
    assert.equal(stream.status, 503);
  });
});
