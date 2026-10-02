/**
 * starintel.actor server: static assets + public-safe dynamic surfaces.
 * Dynamic surfaces: /api/recent-documents, /radar/stream (SSE), /healthz, /readyz.
 * Canonicalization: www.starintel.actor -> starintel.actor (301).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type Config } from "./config.ts";
import { RecentDocumentsService } from "./recent.ts";
import { RadarFeed } from "./radar-feed.ts";
import { SseHub } from "./sse.ts";
import { WardriveService } from "./wardrive.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function send(res: ServerResponse, status: number, body: string, type = "application/json; charset=utf-8"): void {
  res.writeHead(status, { "content-type": type, ...SECURITY_HEADERS });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, JSON.stringify(value));
}


async function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("request body too large");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

function serveStatic(res: ServerResponse, cfg: Config, urlPath: string): void {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  let file = join(cfg.staticDir, rel);
  if (!file.startsWith(cfg.staticDir)) {
    send(res, 403, "forbidden", "text/plain");
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  // MPA routes use clean public URLs (/radar, /research) while Vite emits
  // radar.html/research.html. Resolve extensionless paths to their generated
  // HTML peer before falling through to the 404 page.
  if (!existsSync(file) && extname(file) === "") {
    const htmlFile = `${file}.html`;
    if (existsSync(htmlFile) && statSync(htmlFile).isFile()) file = htmlFile;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    const notFound = join(cfg.staticDir, "404.html");
    if (existsSync(notFound)) {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS });
      createReadStream(notFound).pipe(res);
    } else {
      send(res, 404, "not found", "text/plain");
    }
    return;
  }
  const type = MIME[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, ...SECURITY_HEADERS });
  createReadStream(file).pipe(res);
}

export function createApp(cfg: Config): { handle: (req: IncomingMessage, res: ServerResponse) => void; readyz: () => Promise<{ radar: string; recent: "ok" | "down" }> } {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const resolvedCfg: Config = { ...cfg, staticDir: join(here, "..", cfg.staticDir) };
  const recent = new RecentDocumentsService(resolvedCfg);
  const wardrive = new WardriveService(resolvedCfg);
  const hub = new SseHub();
  const radar = new RadarFeed(resolvedCfg, (events) => hub.sendEvents(events), (totals, rps) => {
    hub.sendRate(totals, rps);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = (req.headers.host ?? "").split(":")[0]!;
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // Canonicalize www -> apex.
    if (host === cfg.wwwHost && host !== cfg.apexHost) {
      const location = `https://${cfg.apexHost}${url.pathname}${url.search}`;
      res.writeHead(301, { location, ...SECURITY_HEADERS });
      res.end();
      return;
    }

    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

    if (url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/readyz") {
      const radarState = radar.state;
      const body = { radar: radarState, recent: "unknown" };
      try {
        await recent.get(1);
        Object.assign(body, { recent: "ok" });
        sendJson(res, 200, { status: radarState === "live" || radarState === "off" ? "ready" : "degraded", ...body });
      } catch {
        Object.assign(body, { recent: "down" });
        sendJson(res, 200, { status: "degraded", ...body });
      }
      return;
    }
    if (url.pathname === "/api/research/status" && req.method === "GET") {
      if (!resolvedCfg.autoResearchUrl) {
        sendJson(res, 200, { configured: false, status: "off" });
        return;
      }
      try {
        const base = resolvedCfg.autoResearchUrl.replace(/\/+$/, "");
        const upstream = await fetch(`${base}/api/v1/health`, {
          headers: { accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(2_000),
        });
        sendJson(res, 200, { configured: true, status: upstream.ok ? "ok" : "down" });
      } catch {
        sendJson(res, 200, { configured: true, status: "down" });
      }
      return;
    }
    if (url.pathname === "/api/wardrive/status" && req.method === "GET") {
      sendJson(res, 200, { configured: wardrive.enabled, profile: "srr/0.2" });
      return;
    }
    if (url.pathname === "/api/wardrive/leaderboard" && req.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? "20");
      try {
        sendJson(res, 200, await wardrive.leaderboard(Number.isFinite(limit) ? limit : 20));
      } catch {
        sendJson(res, 503, { generated_at: new Date().toISOString(), players: [], error: "wardrive store unavailable" });
      }
      return;
    }
    if (url.pathname.startsWith("/api/wardrive/player/") && req.method === "GET") {
      const playerId = decodeURIComponent(url.pathname.slice("/api/wardrive/player/".length));
      try {
        sendJson(res, 200, await wardrive.player(playerId));
      } catch (error) {
        sendJson(res, wardrive.enabled ? 400 : 503, {
          error: error instanceof Error ? error.message : "wardrive player lookup failed",
        });
      }
      return;
    }
    if (url.pathname === "/api/wardrive/runs/import" && req.method === "POST") {
      if (!wardrive.enabled) {
        sendJson(res, 503, { error: "wardrive persistence is not configured" });
        return;
      }
      try {
        const playerId = String(req.headers["x-wardrive-player"] ?? "");
        const displayName = String(req.headers["x-wardrive-handle"] ?? "anon");
        const filename = String(req.headers["x-wardrive-filename"] ?? "capture.dat");
        const sourceHint = req.headers["x-wardrive-source"];
        const body = await readRawBody(req, resolvedCfg.wardriveMaxCaptureBytes);
        const result = await wardrive.importRun({
          body,
          filename,
          sourceHint: typeof sourceHint === "string" ? sourceHint : null,
          playerId,
          displayName,
        });
        sendJson(res, result.duplicate ? 200 : 201, result);
      } catch (error) {
        sendJson(res, 422, {
          error: error instanceof Error ? error.message : "capture import failed",
        });
      }
      return;
    }

    if (url.pathname === "/api/recent-documents") {
      const sampleSize = Number(url.searchParams.get("sample") ?? "12");
      try {
        const value = await recent.get(Number.isFinite(sampleSize) ? sampleSize : 12);
        sendJson(res, 200, value);
      } catch {
        sendJson(res, 503, { documents: [], window: 0, error: "projection unavailable" });
      }
      return;
    }
    if (url.pathname === "/radar/stream") {
      if (req.headers.accept !== "text/event-stream") {
        sendJson(res, 406, { error: "text/event-stream required" });
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(":ok\n\n");
      const client = {
        id: 0,
        write: (chunk: string) => res.write(chunk),
        close: () => res.end(),
      };
      client.id = hub.size + 1;
      hub.add(client);
      req.on("close", () => hub.remove(client));
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    const isWardriveHost = host === cfg.wardriveHost || host === cfg.wardriveStagingHost;
    const staticPath = isWardriveHost && url.pathname === "/" ? "/wardrive" : url.pathname;
    serveStatic(res, resolvedCfg, staticPath);
  }

  return {
    handle: (req, res) => {
      handle(req, res).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: "internal" });
      });
    },
    readyz: async () => ({ radar: radar.state, recent: "ok" }),
  };
}

export function main(argv: string[] = process.argv): void {
  const cfg = loadConfig();
  const app = createApp(cfg);
  const server = createServer(app.handle);
  server.listen(cfg.port, cfg.host, () => {
    console.log(`starintel.actor serving ${cfg.staticDir} on http://${cfg.host}:${cfg.port}`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  main();
}
