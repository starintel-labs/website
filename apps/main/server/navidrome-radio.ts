import { createHash, randomBytes, randomInt } from "node:crypto";

export interface NavidromeRadioConfig {
  url: string | null;
  user: string | null;
  password: string | null;
  playlist: string;
  maxBitrate: number;
}

export interface NavidromeRadioStatus {
  configured: boolean;
  status: "off" | "ready" | "down";
  playlist: string;
}

type FetchLike = typeof fetch;

interface Track {
  id: string;
}

interface SubsonicEnvelope {
  "subsonic-response"?: {
    status?: string;
    playlists?: { playlist?: unknown };
    playlist?: { entry?: unknown };
    searchResult3?: { song?: unknown };
  };
}

function asObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Small public-radio adapter over a private Navidrome/Subsonic endpoint.
 *
 * Auth is generated server-side per request. The browser only ever sees the
 * same-origin StarIntel proxy and never receives the Navidrome URL, username,
 * password, token, or SSH tunnel details.
 */
export class NavidromeRadio {
  private readonly cfg: NavidromeRadioConfig;
  private readonly fetchImpl: FetchLike;
  private cache: { expiresAt: number; tracks: Track[] } | null = null;
  private cursor = 0;

  constructor(cfg: NavidromeRadioConfig, fetchImpl: FetchLike = fetch) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  get configured(): boolean {
    return Boolean(this.cfg.url && this.cfg.user && this.cfg.password);
  }

  async status(): Promise<NavidromeRadioStatus> {
    if (!this.configured) {
      return { configured: false, status: "off", playlist: this.cfg.playlist };
    }
    try {
      const tracks = await this.tracks();
      return {
        configured: true,
        status: tracks.length > 0 ? "ready" : "down",
        playlist: this.cfg.playlist,
      };
    } catch {
      return { configured: true, status: "down", playlist: this.cfg.playlist };
    }
  }

  async openStream(range: string | undefined, signal: AbortSignal): Promise<Response> {
    if (!this.configured) throw new Error("Navidrome radio is not configured");
    const tracks = await this.tracks();
    if (tracks.length === 0) throw new Error("Navidrome radio has no matching tracks");

    if (this.cursor === 0 && tracks.length > 1) this.cursor = randomInt(tracks.length);
    const track = tracks[this.cursor % tracks.length]!;
    this.cursor = (this.cursor + 1) % tracks.length;

    const params: Record<string, string> = { id: track.id };
    if (this.cfg.maxBitrate > 0) params.maxBitRate = String(this.cfg.maxBitrate);
    const url = this.apiUrl("stream", params);

    const headers: Record<string, string> = {};
    if (range) headers.range = range;

    return this.fetchImpl(url, {
      headers,
      redirect: "error",
      signal,
    });
  }

  private apiUrl(endpoint: string, params: Record<string, string> = {}): URL {
    if (!this.cfg.url || !this.cfg.user || !this.cfg.password) {
      throw new Error("Navidrome radio is not configured");
    }

    const salt = randomBytes(12).toString("hex");
    const token = createHash("md5")
      .update(this.cfg.password, "utf8")
      .update(salt, "utf8")
      .digest("hex");

    const url = new URL(`${normalizeBase(this.cfg.url)}/rest/${endpoint}.view`);
    url.searchParams.set("u", this.cfg.user);
    url.searchParams.set("t", token);
    url.searchParams.set("s", salt);
    url.searchParams.set("v", "1.16.1");
    url.searchParams.set("c", "starintel-radar");
    url.searchParams.set("f", "json");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  }

  private async api(endpoint: string, params: Record<string, string> = {}): Promise<SubsonicEnvelope["subsonic-response"]> {
    const response = await this.fetchImpl(this.apiUrl(endpoint, params), {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`Navidrome ${endpoint} returned ${response.status}`);

    const envelope = (await response.json()) as SubsonicEnvelope;
    const body = envelope["subsonic-response"];
    if (!body || body.status !== "ok") throw new Error(`Navidrome ${endpoint} failed`);
    return body;
  }

  private async tracks(): Promise<Track[]> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.tracks;

    const query = this.cfg.playlist.trim().toLowerCase();
    const playlists = await this.api("getPlaylists");
    const playlistRows = asObjects(playlists?.playlists?.playlist);
    const chosen =
      playlistRows.find((row) => String(row.name ?? "").trim().toLowerCase() === query) ??
      playlistRows.find((row) => String(row.name ?? "").trim().toLowerCase().includes(query));

    let tracks: Track[] = [];
    if (chosen && typeof chosen.id === "string" && chosen.id) {
      const detail = await this.api("getPlaylist", { id: chosen.id });
      tracks = asObjects(detail?.playlist?.entry)
        .map((row) => ({ id: typeof row.id === "string" ? row.id : "" }))
        .filter((track) => track.id.length > 0);
    }

    // If there is no exact playlist, treat the configured label as a bounded
    // library search. This keeps "Dark Synthwave" useful without requiring a
    // specially named playlist.
    if (tracks.length === 0) {
      const search = await this.api("search3", {
        query: this.cfg.playlist,
        artistCount: "0",
        albumCount: "0",
        songCount: "100",
      });
      tracks = asObjects(search?.searchResult3?.song)
        .map((row) => ({ id: typeof row.id === "string" ? row.id : "" }))
        .filter((track) => track.id.length > 0);
    }

    if (tracks.length === 0) throw new Error("No Navidrome tracks matched the radar radio query");

    this.cache = {
      tracks,
      expiresAt: now + 10 * 60_000,
    };
    this.cursor = 0;
    return tracks;
  }
}
