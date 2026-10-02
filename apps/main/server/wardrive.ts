import { createHash, createHmac } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { Config } from "./config.ts";
import { scoreRun, type RunInputs, type RunScore } from "../src/wardrive-score.ts";

export type WardriveSource = "wigle" | "kismet";

export interface ParsedWardriveCapture {
  source: WardriveSource;
  rows: number;
  wifiIds: string[];
  bluetoothIds: string[];
  packetCount: number;
  uniqueChannels: number;
  bands: number;
  vendors: number;
  newGridCells: number;
  gpsCoveragePct: number;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number;
}

interface WardriveExtension {
  profile: "srr/0.2";
  player_id: string;
  display_name: string;
  verification: "capture-derived";
  source_format: WardriveSource;
  capture_sha256: string;
  capture_bytes: number;
  radio_fingerprints: string[];
  inputs: RunInputs;
  score: number;
  grade: RunScore["grade"];
  xp: number;
  breakdown: RunScore["breakdown"];
  achievements: string[];
  novelty_pct: number;
}

export interface WardriveRunDoc extends Record<string, unknown> {
  _id: string;
  dataset: "starintel-wardrive";
  dtype: "event";
  schema_version: "0.10.1";
  version: 1;
  date_added: string;
  date_updated: string;
  title: string;
  summary: string;
  status: "completed";
  tags: string[];
  sources: unknown[];
  evidence: unknown[];
  schema_org: Record<string, unknown>;
  data: Record<string, unknown>;
  extensions: {
    "starintel.wardrive": WardriveExtension;
  };
}

export interface PublicWardriveRun {
  id: string;
  player_id: string;
  display_name: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  source_format: WardriveSource;
  verification: "capture-derived";
  score: number;
  grade: RunScore["grade"];
  xp: number;
  novelty_pct: number;
  inputs: RunInputs;
  breakdown: RunScore["breakdown"];
  achievements: string[];
}

export interface WardrivePlayerSummary {
  player_id: string;
  display_name: string;
  total_xp: number;
  level: number;
  runs: number;
  best_score: number;
  best_grade: RunScore["grade"];
  total_distance_km: number;
  unique_radios_seen: number;
}

export interface WardriveLeaderboard {
  generated_at: string;
  players: WardrivePlayerSummary[];
}

const GRADE_ORDER: RunScore["grade"][] = ["F", "D", "C", "B", "A", "S", "S+"];

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseDate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return ms > 0 ? ms : null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function bandForFrequency(freq: number): string | null {
  if (freq >= 2300 && freq < 3000) return "2.4";
  if (freq >= 4900 && freq < 5925) return "5";
  if (freq >= 5925 && freq < 7125) return "6";
  return null;
}

function gridCell(lat: number, lon: number): string {
  return Math.round(lat * 1000) + ":" + Math.round(lon * 1000);
}

function normalizeRadioId(kind: "wifi" | "bluetooth", value: string): string {
  return kind + ":" + value.trim().toLowerCase();
}

export function parseWigleCapture(text: string): ParsedWardriveCapture {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const headerIndex = lines.findIndex((line) => line.startsWith("MAC,SSID,AuthMode,"));
  if (headerIndex < 0) throw new Error("WiGLE header not found");

  const header = parseCsvLine(lines[headerIndex]!);
  const index = new Map<string, number>(header.map((name, i) => [name, i] as const));
  const wifi = new Set<string>();
  const bluetooth = new Set<string>();
  const channels = new Set<string>();
  const bands = new Set<string>();
  const vendors = new Set<string>();
  const cells = new Set<string>();
  let gpsRows = 0;
  let rows = 0;
  let startedMs: number | null = null;
  let endedMs: number | null = null;

  for (const line of lines.slice(headerIndex + 1)) {
    const cols = parseCsvLine(line);
    const mac = cols[index.get("MAC") ?? -1]?.trim();
    if (!mac) continue;
    rows += 1;

    const type = (cols[index.get("Type") ?? -1] ?? "WIFI").toUpperCase();
    const frequency = Number(cols[index.get("Frequency") ?? -1] ?? 0);
    const channel = (cols[index.get("Channel") ?? -1] ?? "").trim();
    const vendor = (cols[index.get("MfgrId") ?? -1] ?? "").trim();
    const lat = Number(cols[index.get("CurrentLatitude") ?? -1] ?? NaN);
    const lon = Number(cols[index.get("CurrentLongitude") ?? -1] ?? NaN);
    const seen = parseDate(
      cols[index.get("FirstSeen") ?? index.get("LastSeen") ?? index.get("First Seen") ?? -1],
    );

    if (type.includes("BT") || type.includes("BLE")) {
      bluetooth.add(normalizeRadioId("bluetooth", mac));
    } else {
      wifi.add(normalizeRadioId("wifi", mac));
      if (channel) channels.add(channel);
      const band = bandForFrequency(frequency);
      if (band) bands.add(band);
    }

    if (vendor) vendors.add(vendor);
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
      gpsRows += 1;
      cells.add(gridCell(lat, lon));
    }
    if (seen !== null) {
      startedMs = startedMs === null ? seen : Math.min(startedMs, seen);
      endedMs = endedMs === null ? seen : Math.max(endedMs, seen);
    }
  }

  return {
    source: "wigle",
    rows,
    wifiIds: [...wifi],
    bluetoothIds: [...bluetooth],
    packetCount: 0,
    uniqueChannels: channels.size,
    bands: bands.size,
    vendors: vendors.size,
    newGridCells: cells.size,
    gpsCoveragePct: rows > 0 ? (gpsRows / rows) * 100 : 0,
    startedAt: iso(startedMs),
    endedAt: iso(endedMs),
    durationMinutes:
      startedMs !== null && endedMs !== null && endedMs >= startedMs
        ? (endedMs - startedMs) / 60_000
        : 0,
  };
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (key in record) return record[key];
  return undefined;
}

function parseKismetRecords(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Kismet JSON must be an array or JSONL");
    return parsed.filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item),
    );
  }
  const records: Record<string, unknown>[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      records.push(parsed as Record<string, unknown>);
    }
  }
  return records;
}

export function parseKismetCapture(text: string): ParsedWardriveCapture {
  const records = parseKismetRecords(text);
  const wifi = new Set<string>();
  const bluetooth = new Set<string>();
  const channels = new Set<string>();
  const bands = new Set<string>();
  const vendors = new Set<string>();
  let packetCount = 0;
  let startedMs: number | null = null;
  let endedMs: number | null = null;

  for (const record of records) {
    const mac = String(
      pick(record, "kismet.device.base.macaddr", "mac", "macaddr") ?? "",
    ).trim();
    if (!mac) continue;

    const type = String(
      pick(record, "kismet.device.base.type", "type", "phyname") ?? "",
    ).toLowerCase();
    const channel = String(
      pick(record, "kismet.device.base.channel", "channel") ?? "",
    ).trim();
    const rawFrequency = Number(
      pick(record, "kismet.device.base.frequency", "frequency", "freq_khz") ?? 0,
    );
    const frequency = rawFrequency > 100_000 ? rawFrequency / 1000 : rawFrequency;
    const vendor = String(
      pick(record, "kismet.device.base.manuf", "manufacturer", "vendor") ?? "",
    ).trim();
    const packets = Number(
      pick(record, "kismet.device.base.packets.total", "packets", "packet_count") ?? 0,
    );
    const first = parseDate(
      pick(record, "kismet.device.base.first_time", "first_time", "first_seen"),
    );
    const last = parseDate(
      pick(record, "kismet.device.base.last_time", "last_time", "last_seen"),
    );

    if (type.includes("bluetooth") || type.includes("ble") || type === "bt") {
      bluetooth.add(normalizeRadioId("bluetooth", mac));
    } else {
      wifi.add(normalizeRadioId("wifi", mac));
      if (channel) channels.add(channel);
      const band = bandForFrequency(frequency);
      if (band) bands.add(band);
    }

    if (vendor) vendors.add(vendor);
    if (Number.isFinite(packets) && packets > 0) packetCount += packets;
    if (first !== null) startedMs = startedMs === null ? first : Math.min(startedMs, first);
    if (last !== null) endedMs = endedMs === null ? last : Math.max(endedMs, last);
  }

  return {
    source: "kismet",
    rows: records.length,
    wifiIds: [...wifi],
    bluetoothIds: [...bluetooth],
    packetCount,
    uniqueChannels: channels.size,
    bands: bands.size,
    vendors: vendors.size,
    newGridCells: 0,
    gpsCoveragePct: 0,
    startedAt: iso(startedMs),
    endedAt: iso(endedMs),
    durationMinutes:
      startedMs !== null && endedMs !== null && endedMs >= startedMs
        ? (endedMs - startedMs) / 60_000
        : 0,
  };
}

function detectSource(filename: string, text: string, hint?: string | null): WardriveSource {
  const normalized = hint?.toLowerCase();
  if (normalized === "wigle" || normalized === "kismet") return normalized;
  const lower = filename.toLowerCase();
  if (
    lower.endsWith(".csv") ||
    lower.endsWith(".csv.gz") ||
    text.startsWith("WigleWifi-") ||
    text.includes("\nMAC,SSID,AuthMode,")
  ) {
    return "wigle";
  }
  return "kismet";
}

export function parseCaptureBytes(
  body: Buffer,
  filename: string,
  hint: string | null,
  maxInflatedBytes: number,
): ParsedWardriveCapture {
  const gzip = filename.toLowerCase().endsWith(".gz") || (body[0] === 0x1f && body[1] === 0x8b);
  const bytes = gzip ? gunzipSync(body, { maxOutputLength: maxInflatedBytes }) : body;
  if (bytes.byteLength > maxInflatedBytes) throw new Error("capture expands past the configured limit");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const source = detectSource(filename, text, hint);
  return source === "wigle" ? parseWigleCapture(text) : parseKismetCapture(text);
}

function sanitizePlayerId(value: string): string {
  const v = value.trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(v)) throw new Error("invalid player id");
  return v;
}

function sanitizeDisplayName(value: string): string {
  const v = value.trim().replace(/\s+/g, " ").slice(0, 32);
  if (v.length < 1) return "anon";
  return v.replace(/[^\p{L}\p{N} _.\-]/gu, "");
}

function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 1200));
}

function fingerprint(secret: string, radioId: string): string {
  return createHmac("sha256", secret).update(radioId).digest("hex");
}

function runId(secret: string, captureSha256: string): string {
  return "wardrive-run:" + createHmac("sha256", secret).update(captureSha256).digest("hex").slice(0, 40);
}

function extensionOf(doc: WardriveRunDoc): WardriveExtension {
  return doc.extensions["starintel.wardrive"];
}

export function projectWardriveRun(doc: WardriveRunDoc): PublicWardriveRun {
  const ext = extensionOf(doc);
  const data = doc.data;
  return {
    id: doc._id,
    player_id: ext.player_id,
    display_name: ext.display_name,
    created_at: doc.date_added,
    started_at: typeof data.start_at === "string" ? data.start_at : null,
    ended_at: typeof data.end_at === "string" ? data.end_at : null,
    source_format: ext.source_format,
    verification: ext.verification,
    score: ext.score,
    grade: ext.grade,
    xp: ext.xp,
    novelty_pct: ext.novelty_pct,
    inputs: ext.inputs,
    breakdown: ext.breakdown,
    achievements: ext.achievements,
  };
}

export function buildWardriveRunDocument(args: {
  id: string;
  playerId: string;
  displayName: string;
  captureSha256: string;
  captureBytes: number;
  parsed: ParsedWardriveCapture;
  radioFingerprints: string[];
  inputs: RunInputs;
  result: RunScore;
  now: string;
}): WardriveRunDoc {
  const { parsed, result, inputs } = args;
  return {
    _id: args.id,
    dataset: "starintel-wardrive",
    dtype: "event",
    schema_version: "0.10.1",
    version: 1,
    date_added: args.now,
    date_updated: args.now,
    title: "Wireless survey run · " + result.grade + " " + result.score,
    summary:
      "SRR " +
      result.score +
      " (" +
      result.grade +
      "), " +
      Math.round(inputs.wifiTotal + inputs.bluetoothTotal) +
      " radios, " +
      Math.round(inputs.durationMinutes) +
      " min",
    status: "completed",
    tags: ["wardrive", "wireless-survey", "gamification", parsed.source],
    sources: [],
    evidence: [],
    schema_org: {
      "@context": "https://schema.org",
      "@type": "Event",
      "@id": "https://wardrive.starintel.actor/runs/" + encodeURIComponent(args.id),
      additionalType: "https://spec.starintel.actor/ontology/WirelessSurveyRun",
      name: "StarIntel wireless survey run",
      startDate: parsed.startedAt,
      endDate: parsed.endedAt,
    },
    data: {
      event_kind: "wireless-survey-run",
      name: "Wireless survey run",
      start_at: parsed.startedAt,
      end_at: parsed.endedAt,
      status: "completed",
      outcome: result.grade + ":" + result.score,
    },
    extensions: {
      "starintel.wardrive": {
        profile: "srr/0.2",
        player_id: args.playerId,
        display_name: args.displayName,
        verification: "capture-derived",
        source_format: parsed.source,
        capture_sha256: args.captureSha256,
        capture_bytes: args.captureBytes,
        radio_fingerprints: args.radioFingerprints,
        inputs,
        score: result.score,
        grade: result.grade,
        xp: result.xp,
        breakdown: result.breakdown,
        achievements: result.achievements,
        novelty_pct: result.noveltyPct,
      },
    },
  };
}

interface CouchRows {
  rows?: Array<{ doc?: WardriveRunDoc }>;
}

export class WardriveService {
  readonly enabled: boolean;
  #cfg: Config;
  #ensured = false;

  constructor(cfg: Config) {
    this.#cfg = cfg;
    this.enabled = Boolean(cfg.wardriveIdHashKey);
  }

  async importRun(args: {
    body: Buffer;
    filename: string;
    sourceHint: string | null;
    playerId: string;
    displayName: string;
  }): Promise<{ run: PublicWardriveRun; duplicate: boolean }> {
    if (!this.enabled) throw new Error("wardrive persistence is not configured");
    if (args.body.byteLength < 1) throw new Error("empty capture");
    if (args.body.byteLength > this.#cfg.wardriveMaxCaptureBytes) {
      throw new Error("capture exceeds the configured upload limit");
    }

    const secret = this.#cfg.wardriveIdHashKey!;
    const playerId = sanitizePlayerId(args.playerId);
    const displayName = sanitizeDisplayName(args.displayName);
    const captureSha256 = createHash("sha256").update(args.body).digest("hex");
    const id = runId(secret, captureSha256);

    await this.#ensureDb();
    const existing = await this.#getRun(id);
    if (existing) return { run: projectWardriveRun(existing), duplicate: true };

    const parsed = parseCaptureBytes(
      args.body,
      args.filename,
      args.sourceHint,
      this.#cfg.wardriveMaxInflatedBytes,
    );
    if (parsed.rows < 1) throw new Error("capture has zero observations");

    const allRadioIds = [...parsed.wifiIds, ...parsed.bluetoothIds];
    const radioFingerprints = allRadioIds.map((value) => fingerprint(secret, value));
    const prior = await this.#runsForPlayer(playerId, this.#cfg.wardriveHistoryScanLimit);
    const seen = new Set<string>();
    for (const doc of prior) {
      for (const fp of extensionOf(doc).radio_fingerprints ?? []) seen.add(fp);
    }

    let wifiNew = 0;
    let bluetoothNew = 0;
    for (const idValue of parsed.wifiIds) {
      if (!seen.has(fingerprint(secret, idValue))) wifiNew += 1;
    }
    for (const idValue of parsed.bluetoothIds) {
      if (!seen.has(fingerprint(secret, idValue))) bluetoothNew += 1;
    }

    const inputs: RunInputs = {
      distanceKm: 0,
      durationMinutes: parsed.durationMinutes,
      gpsCoveragePct: parsed.gpsCoveragePct,
      wifiNew,
      wifiTotal: parsed.wifiIds.length,
      bluetoothNew,
      bluetoothTotal: parsed.bluetoothIds.length,
      otherNew: 0,
      packetCount: parsed.packetCount,
      uniqueChannels: parsed.uniqueChannels,
      bands: parsed.bands,
      vendors: parsed.vendors,
      newGridCells: parsed.newGridCells,
      sourceCount: 1,
    };
    const result = scoreRun(inputs);
    const now = new Date().toISOString();
    const doc = buildWardriveRunDocument({
      id,
      playerId,
      displayName,
      captureSha256,
      captureBytes: args.body.byteLength,
      parsed,
      radioFingerprints,
      inputs,
      result,
      now,
    });
    await this.#putRun(doc);
    return { run: projectWardriveRun(doc), duplicate: false };
  }

  async leaderboard(limit = 20): Promise<WardriveLeaderboard> {
    if (!this.enabled) return { generated_at: new Date().toISOString(), players: [] };
    await this.#ensureDb();
    const docs = await this.#allRuns(this.#cfg.wardriveHistoryScanLimit);
    const players = new Map<string, WardrivePlayerSummary>();

    for (const doc of docs) {
      const ext = extensionOf(doc);
      const current = players.get(ext.player_id) ?? {
        player_id: ext.player_id,
        display_name: ext.display_name,
        total_xp: 0,
        level: 1,
        runs: 0,
        best_score: 0,
        best_grade: "F" as RunScore["grade"],
        total_distance_km: 0,
        unique_radios_seen: 0,
      };
      current.display_name = ext.display_name;
      current.total_xp += ext.xp;
      current.runs += 1;
      current.total_distance_km += ext.inputs.distanceKm;
      current.unique_radios_seen += ext.inputs.wifiNew + ext.inputs.bluetoothNew + ext.inputs.otherNew;
      if (ext.score > current.best_score) {
        current.best_score = ext.score;
        current.best_grade = ext.grade;
      }
      players.set(ext.player_id, current);
    }

    const output = [...players.values()];
    for (const player of output) player.level = levelForXp(player.total_xp);
    output.sort(
      (a, b) =>
        b.total_xp - a.total_xp ||
        b.best_score - a.best_score ||
        a.display_name.localeCompare(b.display_name),
    );
    return {
      generated_at: new Date().toISOString(),
      players: output.slice(0, Math.max(1, Math.min(limit, 100))),
    };
  }

  async player(playerIdRaw: string): Promise<{
    player: WardrivePlayerSummary;
    runs: PublicWardriveRun[];
  }> {
    if (!this.enabled) throw new Error("wardrive persistence is not configured");
    const playerId = sanitizePlayerId(playerIdRaw);
    await this.#ensureDb();
    const docs = await this.#runsForPlayer(playerId, this.#cfg.wardriveHistoryScanLimit);
    const runs = docs
      .map(projectWardriveRun)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const totalXp = runs.reduce((sum, run) => sum + run.xp, 0);
    const best = runs.reduce<PublicWardriveRun | null>(
      (value, run) => (value === null || run.score > value.score ? run : value),
      null,
    );
    const displayName = runs[0]?.display_name ?? "anon";
    const unique = new Set<string>();
    for (const doc of docs) for (const fp of extensionOf(doc).radio_fingerprints ?? []) unique.add(fp);

    return {
      player: {
        player_id: playerId,
        display_name: displayName,
        total_xp: totalXp,
        level: levelForXp(totalXp),
        runs: runs.length,
        best_score: best?.score ?? 0,
        best_grade: best?.grade ?? "F",
        total_distance_km: runs.reduce((sum, run) => sum + run.inputs.distanceKm, 0),
        unique_radios_seen: unique.size,
      },
      runs,
    };
  }

  async #ensureDb(): Promise<void> {
    if (this.#ensured) return;
    const res = await fetch(this.#dbUrl(), {
      method: "PUT",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok && res.status !== 412) {
      throw new Error("wardrive CouchDB unavailable: HTTP " + res.status);
    }
    this.#ensured = true;
  }

  #dbUrl(path = ""): string {
    const base = this.#cfg.couchdbUrl.replace(/\/+$/, "");
    return base + "/" + encodeURIComponent(this.#cfg.wardriveDb) + path;
  }

  async #getRun(id: string): Promise<WardriveRunDoc | null> {
    const res = await fetch(this.#dbUrl("/" + encodeURIComponent(id)), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("wardrive CouchDB read failed: HTTP " + res.status);
    return (await res.json()) as WardriveRunDoc;
  }

  async #putRun(doc: WardriveRunDoc): Promise<void> {
    const res = await fetch(this.#dbUrl("/" + encodeURIComponent(doc._id)), {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(doc),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 409) return;
    if (!res.ok) throw new Error("wardrive CouchDB write failed: HTTP " + res.status);
  }

  async #allRuns(limit: number): Promise<WardriveRunDoc[]> {
    const startkey = JSON.stringify("wardrive-run:");
    const endkey = JSON.stringify("wardrive-run:\ufff0");
    const url =
      this.#dbUrl("/_all_docs") +
      "?include_docs=true&startkey=" +
      encodeURIComponent(startkey) +
      "&endkey=" +
      encodeURIComponent(endkey) +
      "&limit=" +
      String(Math.max(1, limit));
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error("wardrive CouchDB scan failed: HTTP " + res.status);
    const body = (await res.json()) as CouchRows;
    return (body.rows ?? []).flatMap((row) => (row.doc ? [row.doc] : []));
  }

  async #runsForPlayer(playerId: string, limit: number): Promise<WardriveRunDoc[]> {
    const docs = await this.#allRuns(limit);
    return docs.filter((doc) => extensionOf(doc).player_id === playerId);
  }
}

export function betterGrade(a: RunScore["grade"], b: RunScore["grade"]): RunScore["grade"] {
  return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}
