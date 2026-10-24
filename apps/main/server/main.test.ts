import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { loadConfig } from "./config.ts";
import { createApp } from "./main.ts";

test("clean radar route serves the built page", async () => {
  const app = createApp(loadConfig({ RABBIT_URL: "", STATIC_DIR: "dist" }));
  const server = createServer(app.handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/radar`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /radar/i);
  } finally {
    app.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
