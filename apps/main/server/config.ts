/** Environment-driven configuration. All secrets stay in the private network. */

export interface Config {
  port: number;
  host: string;
  staticDir: string;
  /** Canonical apex; www is redirected here. */
  apexHost: string;
  wwwHost: string;
  /** Public host for the wardrive run-rating surface. */
  wardriveHost: string;
  wardriveStagingHost: string;
  wardriveCouchdbUrl: string;
  wardriveDb: string;
  wardriveIdHashKey: string | null;
  wardriveMaxCaptureBytes: number;
  wardriveMaxInflatedBytes: number;
  wardriveHistoryScanLimit: number;
  /** Private StarIntel infrastructure (never exposed to browsers). */
  couchdbUrl: string;
  couchdbDb: string;
  rabbitUrl: string | null;
  rabbitExchange: string;
  /** Optional Auto Research harness base URL; only /health is projected publicly. */
  autoResearchUrl: string | null;
  /** Recent-documents window and cache. */
  recentWindow: number;
  recentCacheMs: number;
  /** SSE batch interval. */
  radarFrameMs: number;
}

function int(env: NodeJS.ProcessEnv, name: string, def: number): number {
  const v = env[name];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid " + name + ": " + v);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: int(env, "PORT", 8787),
    host: env.HOST ?? "127.0.0.1",
    staticDir: env.STATIC_DIR ?? "dist",
    apexHost: env.APEX_HOST ?? "starintel.actor",
    wwwHost: env.WWW_HOST ?? "www.starintel.actor",
    wardriveHost: env.WARDRIVE_HOST ?? "wardrive.starintel.actor",
    wardriveStagingHost: env.WARDRIVE_STAGING_HOST ?? "wardrive-staging.starintel.actor",
    wardriveCouchdbUrl: env.WARDRIVE_COUCHDB_URL ?? "http://127.0.0.1:15985",
    wardriveDb: env.WARDRIVE_DB ?? "starintel-wardrive",
    wardriveIdHashKey: env.WARDRIVE_ID_HASH_KEY ?? null,
    wardriveMaxCaptureBytes: int(env, "WARDRIVE_MAX_CAPTURE_BYTES", 32 * 1024 * 1024),
    wardriveMaxInflatedBytes: int(env, "WARDRIVE_MAX_INFLATED_BYTES", 128 * 1024 * 1024),
    wardriveHistoryScanLimit: Math.max(100, Math.min(int(env, "WARDRIVE_HISTORY_SCAN_LIMIT", 5000), 50000)),
    couchdbUrl: env.COUCHDB_URL ?? "http://127.0.0.1:5984",
    couchdbDb: env.COUCHDB_DB ?? "starintel",
    rabbitUrl: env.RABBIT_URL ?? null,
    rabbitExchange: env.RABBIT_EXCHANGE ?? "starintel",
    autoResearchUrl: env.AUTO_RESEARCH_URL ?? null,
    recentWindow: Math.min(int(env, "RECENT_WINDOW", 100), 100),
    recentCacheMs: int(env, "RECENT_CACHE_MS", 60000),
    radarFrameMs: Math.max(int(env, "RADAR_FRAME_MS", 250), 50),
  };
}
