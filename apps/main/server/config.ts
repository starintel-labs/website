/** Environment-driven configuration. All secrets stay in the private network. */

export interface Config {
  port: number;
  host: string;
  staticDir: string;
  /** Canonical apex; www is redirected here. */
  apexHost: string;
  wwwHost: string;
  /** Private StarIntel infrastructure (never exposed to browsers). */
  couchdbUrl: string;
  couchdbDb: string;
  rabbitUrl: string | null;
  rabbitExchange: string;
  /** Stable shared tenant whose explicitly public documents may reach the website. */
  publicTenantId: string;
  /** Optional Auto Research harness base URL; only /health is projected publicly. */
  autoResearchUrl: string | null;
  /** Recent-documents window and cache. */
  recentWindow: number;
  recentCacheMs: number;
  /** SSE batch interval. */
  radarFrameMs: number;
}

function int(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid ${name}: ${v}`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const publicTenantId = env.PUBLIC_TENANT_ID ?? "public";
  if (publicTenantId !== "public") throw new Error("invalid PUBLIC_TENANT_ID");
  return {
    port: int("PORT", 8787),
    host: env.HOST ?? "127.0.0.1",
    staticDir: env.STATIC_DIR ?? "dist",
    apexHost: env.APEX_HOST ?? "starintel.actor",
    wwwHost: env.WWW_HOST ?? "www.starintel.actor",
    couchdbUrl: env.COUCHDB_URL ?? "http://127.0.0.1:5984",
    couchdbDb: env.COUCHDB_DB ?? "starintel",
    rabbitUrl: env.RABBIT_URL ?? null,
    // starintel-server's durable topic exchange is named "documents".
    rabbitExchange: env.RABBIT_EXCHANGE ?? "documents",
    publicTenantId,
    autoResearchUrl: env.AUTO_RESEARCH_URL ?? null,
    recentWindow: Math.min(int("RECENT_WINDOW", 100), 100),
    recentCacheMs: int("RECENT_CACHE_MS", 60_000),
    radarFrameMs: Math.max(int("RADAR_FRAME_MS", 250), 50),
  };
}
