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
  /** Optional Auto Research harness base URL; only /health is projected publicly. */
  autoResearchUrl: string | null;
  /** Private Navidrome endpoint, normally a loopback SSH forward. */
  navidromeUrl: string | null;
  navidromeUser: string | null;
  navidromePassword: string | null;
  navidromePlaylist: string;
  navidromeMaxBitrate: number;
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
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid ${name}: ${v}`);
  return n;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: int(env, "PORT", 8787),
    host: env.HOST ?? "127.0.0.1",
    staticDir: env.STATIC_DIR ?? "dist",
    apexHost: env.APEX_HOST ?? "starintel.actor",
    wwwHost: env.WWW_HOST ?? "www.starintel.actor",
    couchdbUrl: env.COUCHDB_URL ?? "http://127.0.0.1:5984",
    couchdbDb: env.COUCHDB_DB ?? "starintel",
    rabbitUrl: optional(env, "RABBIT_URL"),
    rabbitExchange: env.RABBIT_EXCHANGE ?? "starintel",
    autoResearchUrl: optional(env, "AUTO_RESEARCH_URL"),
    navidromeUrl: optional(env, "NAVIDROME_URL"),
    navidromeUser: optional(env, "NAVIDROME_USER"),
    navidromePassword: optional(env, "NAVIDROME_PASSWORD"),
    navidromePlaylist: env.NAVIDROME_PLAYLIST?.trim() || "Dark Synthwave",
    navidromeMaxBitrate: Math.min(int(env, "NAVIDROME_MAX_BITRATE", 192), 320),
    recentWindow: Math.min(int(env, "RECENT_WINDOW", 100), 100),
    recentCacheMs: int(env, "RECENT_CACHE_MS", 60_000),
    radarFrameMs: Math.max(int(env, "RADAR_FRAME_MS", 250), 50),
  };
}
