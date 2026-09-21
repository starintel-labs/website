import { test } from "node:test";
import assert from "node:assert/strict";
import { NavidromeRadio } from "./navidrome-radio.ts";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("Navidrome radio keeps credentials server-side and streams playlist tracks", async () => {
  const urls: URL[] = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    urls.push(url);

    if (url.pathname.endsWith("/getPlaylists.view")) {
      return json({
        "subsonic-response": {
          status: "ok",
          playlists: { playlist: [{ id: "playlist-1", name: "Dark Synthwave" }] },
        },
      });
    }
    if (url.pathname.endsWith("/getPlaylist.view")) {
      return json({
        "subsonic-response": {
          status: "ok",
          playlist: { entry: [{ id: "track-1", title: "Night Drive" }] },
        },
      });
    }
    if (url.pathname.endsWith("/stream.view")) {
      assert.equal(init?.headers && (init.headers as Record<string, string>).range, "bytes=0-");
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: {
          "content-type": "audio/mpeg",
          "content-range": "bytes 0-2/3",
        },
      });
    }
    throw new Error(`unexpected Navidrome call: ${url.pathname}`);
  }) as typeof fetch;

  const radio = new NavidromeRadio(
    {
      url: "http://127.0.0.1:4534",
      user: "radar",
      password: "super-secret-password",
      playlist: "Dark Synthwave",
      maxBitrate: 192,
    },
    fakeFetch,
  );

  assert.deepEqual(await radio.status(), {
    configured: true,
    status: "ready",
    playlist: "Dark Synthwave",
  });

  const response = await radio.openStream("bytes=0-", new AbortController().signal);
  assert.equal(response.status, 206);

  const streamUrl = urls.at(-1)!;
  assert.match(streamUrl.pathname, /stream\.view$/);
  assert.equal(streamUrl.searchParams.get("id"), "track-1");
  assert.equal(streamUrl.searchParams.get("maxBitRate"), "192");
  assert.equal(streamUrl.searchParams.get("u"), "radar");
  assert.match(streamUrl.searchParams.get("t") ?? "", /^[0-9a-f]{32}$/);
  assert.ok(streamUrl.searchParams.get("s"));
  assert.equal(urls.some((url) => url.toString().includes("super-secret-password")), false);
});

test("Navidrome radio falls back to bounded library search", async () => {
  const fakeFetch = (async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/getPlaylists.view")) {
      return json({ "subsonic-response": { status: "ok", playlists: { playlist: [] } } });
    }
    if (url.pathname.endsWith("/search3.view")) {
      assert.equal(url.searchParams.get("query"), "Dark Synthwave");
      assert.equal(url.searchParams.get("songCount"), "100");
      return json({
        "subsonic-response": {
          status: "ok",
          searchResult3: { song: [{ id: "search-track" }] },
        },
      });
    }
    throw new Error(`unexpected Navidrome call: ${url.pathname}`);
  }) as typeof fetch;

  const radio = new NavidromeRadio(
    {
      url: "http://127.0.0.1:4534",
      user: "radar",
      password: "secret",
      playlist: "Dark Synthwave",
      maxBitrate: 0,
    },
    fakeFetch,
  );

  assert.equal((await radio.status()).status, "ready");
});
