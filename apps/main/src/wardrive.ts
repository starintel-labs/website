import { renderWordmark } from "@starintel/design/wordmark";
import { scoreRun, type RunInputs } from "./wardrive-score.ts";
import "./wardrive.css";

const brand = document.querySelector<HTMLElement>("[data-wordmark]");
if (brand) brand.replaceChildren(renderWordmark({ size: "sm", compact: true }));
const foot = document.querySelector<HTMLElement>("[data-wordmark-sm]");
if (foot) foot.replaceChildren(renderWordmark({ size: "sm", compact: true }));

const fields = new Map<string, HTMLInputElement>();
for (const input of document.querySelectorAll<HTMLInputElement>("[data-field]")) {
  const name = input.dataset.field;
  if (name) fields.set(name, input);
}

const scoreEl = document.querySelector<HTMLElement>("[data-score]");
const gradeEl = document.querySelector<HTMLElement>("[data-grade]");
const xpEl = document.querySelector<HTMLElement>("[data-xp]");
const ringEl = document.querySelector<SVGCircleElement>("[data-ring]");
const breakdownEl = document.querySelector<HTMLElement>("[data-breakdown]");
const achievementsEl = document.querySelector<HTMLElement>("[data-achievements]");
const noveltyEl = document.querySelector<HTMLElement>("[data-novelty]");
const newRadiosEl = document.querySelector<HTMLElement>("[data-new-radios]");
const densityEl = document.querySelector<HTMLElement>("[data-density]");
const sourcesEl = document.querySelector<HTMLElement>("[data-sources]");
const fileEl = document.querySelector<HTMLInputElement>("[data-run-file]");
const importStatusEl = document.querySelector<HTMLElement>("[data-import-status]");
const sourceChipEl = document.querySelector<HTMLElement>("[data-source-chip]");
const saveButtonEl = document.querySelector<HTMLButtonElement>("[data-save-run]");
const saveStatusEl = document.querySelector<HTMLElement>("[data-save-status]");
const handleEl = document.querySelector<HTMLInputElement>("[data-player-handle]");
const persistenceChipEl = document.querySelector<HTMLElement>("[data-persistence-chip]");
const playerLevelEl = document.querySelector<HTMLElement>("[data-player-level]");
const playerXpEl = document.querySelector<HTMLElement>("[data-player-xp]");
const playerRunsEl = document.querySelector<HTMLElement>("[data-player-runs]");
const playerRadiosEl = document.querySelector<HTMLElement>("[data-player-radios]");
const playerBestEl = document.querySelector<HTMLElement>("[data-player-best]");
const playerStreakEl = document.querySelector<HTMLElement>("[data-player-streak]");
const runHistoryEl = document.querySelector<HTMLElement>("[data-run-history]");
const challengesEl = document.querySelector<HTMLElement>("[data-challenges]");
const leaderboardEl = document.querySelector<HTMLElement>("[data-leaderboard]");

const sources = new Set<string>();
const PLAYER_TOKEN_KEY = "starintel.wardrive.player-token";
const HANDLE_KEY = "starintel.wardrive.handle";
let selectedFile: File | null = null;
let lastImportRows = 0;
let persistenceConfigured = false;

function playerToken(): string {
  const existing = localStorage.getItem(PLAYER_TOKEN_KEY);
  if (existing) return existing;
  const created = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  localStorage.setItem(PLAYER_TOKEN_KEY, created);
  return created;
}

function currentHandle(): string {
  const raw = handleEl?.value ?? localStorage.getItem(HANDLE_KEY) ?? "anon";
  const clean = raw.replace(/[^A-Za-z0-9_. -]/g, "").trim().slice(0, 32) || "anon";
  if (handleEl && handleEl.value !== clean) handleEl.value = clean;
  localStorage.setItem(HANDLE_KEY, clean);
  return clean;
}

if (handleEl) handleEl.value = localStorage.getItem(HANDLE_KEY) ?? "anon";

const categoryCaps = {
  exploration: 250,
  discovery: 250,
  diversity: 150,
  captureQuality: 150,
  density: 100,
  novelty: 75,
  endurance: 25,
} as const;

const categoryLabels: Record<keyof typeof categoryCaps, string> = {
  exploration: "exploration",
  discovery: "discovery",
  diversity: "RF diversity",
  captureQuality: "capture quality",
  density: "density",
  novelty: "novelty",
  endurance: "endurance",
};

const badgeDescriptions: Record<string, string> = {
  "Packet Goblin": "1,000,000+ packets observed",
  "Urban Archaeologist": "1,000+ new Wi-Fi radios",
  "Spectrum Tourist": "three Wi-Fi bands in one run",
  "No Stone Unturned": "95%+ GPS coverage",
  "RF Rainforest": "500+ new radios per km",
  "Fresh Ground": "90%+ of observed radios are new",
  "Dual Wield": "WiGLE and Kismet data combined",
  "Long Haul": "15+ km in one run",
};

function value(name: string): number {
  const raw = Number(fields.get(name)?.value ?? 0);
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

function setValue(name: string, next: number): void {
  const input = fields.get(name);
  if (!input) return;
  input.value = String(Number.isFinite(next) ? Math.max(0, Math.round(next * 100) / 100) : 0);
}

function currentInputs(): RunInputs {
  return {
    distanceKm: value("distanceKm"),
    durationMinutes: value("durationMinutes"),
    gpsCoveragePct: Math.min(100, value("gpsCoveragePct")),
    wifiNew: value("wifiNew"),
    wifiTotal: value("wifiTotal"),
    bluetoothNew: value("bluetoothNew"),
    bluetoothTotal: value("bluetoothTotal"),
    otherNew: 0,
    packetCount: value("packetCount"),
    uniqueChannels: value("uniqueChannels"),
    bands: value("bands"),
    vendors: value("vendors"),
    newGridCells: value("newGridCells"),
    sourceCount: sources.size,
  };
}

function render(): void {
  const input = currentInputs();
  const result = scoreRun(input);

  if (scoreEl) scoreEl.textContent = result.score.toLocaleString();
  if (gradeEl) gradeEl.textContent = result.grade;
  if (xpEl) xpEl.textContent = result.xp.toLocaleString();
  if (noveltyEl) noveltyEl.textContent = result.noveltyPct + "%";

  const newRadios = input.wifiNew + input.bluetoothNew + input.otherNew;
  if (newRadiosEl) newRadiosEl.textContent = Math.round(newRadios).toLocaleString();
  if (densityEl) {
    const perKm = input.distanceKm > 0 ? newRadios / input.distanceKm : 0;
    densityEl.textContent = perKm.toFixed(perKm >= 100 ? 0 : 1);
  }
  if (sourcesEl) sourcesEl.textContent = String(sources.size);

  if (ringEl) {
    const circumference = 2 * Math.PI * 50;
    ringEl.style.strokeDasharray = String(circumference);
    ringEl.style.strokeDashoffset = String(circumference * (1 - result.score / 1000));
  }

  if (breakdownEl) {
    breakdownEl.replaceChildren();
    for (const [key, max] of Object.entries(categoryCaps) as Array<
      [keyof typeof categoryCaps, number]
    >) {
      const score = result.breakdown[key];
      const row = document.createElement("div");
      row.className = "wd-bar";

      const name = document.createElement("span");
      name.className = "wd-bar__name";
      name.textContent = categoryLabels[key];

      const track = document.createElement("span");
      track.className = "wd-bar__track";
      const bar = document.createElement("span");
      bar.className = "wd-bar__value";
      bar.style.width = Math.min(100, (score / max) * 100) + "%";
      track.append(bar);

      const amount = document.createElement("span");
      amount.className = "wd-bar__score";
      amount.textContent = score + "/" + max;

      row.append(name, track, amount);
      breakdownEl.append(row);
    }
  }

  if (achievementsEl) {
    achievementsEl.replaceChildren();
    if (result.achievements.length === 0) {
      const empty = document.createElement("div");
      empty.className = "si-empty";
      empty.innerHTML =
        '<span class="si-empty__mark">◇</span><span class="si-empty__title">No badges yet.</span><span>Go find some spectrum.</span>';
      achievementsEl.append(empty);
    } else {
      for (const badge of result.achievements) {
        const card = document.createElement("div");
        card.className = "wd-achievement";
        const mark = document.createElement("span");
        mark.className = "wd-achievement__mark";
        mark.textContent = "◆";
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = badge;
        const desc = document.createElement("span");
        desc.textContent = badgeDescriptions[badge] ?? "achievement unlocked";
        copy.append(title, desc);
        card.append(mark, copy);
        achievementsEl.append(card);
      }
    }
  }

  if (sourceChipEl) {
    sourceChipEl.textContent = sources.size ? Array.from(sources).join(" + ") : "manual";
  }
}

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

function bandForFrequency(freq: number): string | null {
  if (freq >= 2300 && freq < 3000) return "2.4";
  if (freq >= 4900 && freq < 5925) return "5";
  if (freq >= 5925 && freq < 7125) return "6";
  return null;
}

function gridCell(lat: number, lon: number): string {
  return Math.round(lat * 1000) + ":" + Math.round(lon * 1000);
}

async function readText(file: File): Promise<string> {
  if (!file.name.toLowerCase().endsWith(".gz")) return file.text();
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress .gz files; export plain CSV instead.");
  }
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

type ImportSummary = {
  rows: number;
  wifi: number;
  bluetooth: number;
  channels: number;
  bands: number;
  vendors: number;
  gridCells: number;
  gpsCoveragePct: number;
  packets: number;
};

function importWigle(text: string): ImportSummary {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const headerIndex = lines.findIndex((line) => line.startsWith("MAC,SSID,AuthMode,"));
  if (headerIndex < 0) throw new Error("WiGLE header not found.");

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

    if (type.includes("BT") || type.includes("BLE")) {
      bluetooth.add(mac);
    } else {
      wifi.add(mac);
      if (channel) channels.add(channel);
      const band = bandForFrequency(frequency);
      if (band) bands.add(band);
    }

    if (vendor) vendors.add(vendor);
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
      gpsRows += 1;
      cells.add(gridCell(lat, lon));
    }
  }

  return {
    rows,
    wifi: wifi.size,
    bluetooth: bluetooth.size,
    channels: channels.size,
    bands: bands.size,
    vendors: vendors.size,
    gridCells: cells.size,
    gpsCoveragePct: rows > 0 ? (gpsRows / rows) * 100 : 0,
    packets: 0,
  };
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function parseKismetRecords(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("Kismet JSON must be an array or JSONL.");
    return parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }
  const out: Record<string, unknown>[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = JSON.parse(line);
    if (item && typeof item === "object" && !Array.isArray(item)) out.push(item);
  }
  return out;
}

function importKismet(text: string): ImportSummary {
  const records = parseKismetRecords(text);
  const wifi = new Set<string>();
  const bluetooth = new Set<string>();
  const channels = new Set<string>();
  const bands = new Set<string>();
  const vendors = new Set<string>();
  let packets = 0;

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
    const frequency = Number(
      pick(record, "kismet.device.base.frequency", "frequency", "freq_khz") ?? 0,
    );
    const vendor = String(
      pick(record, "kismet.device.base.manuf", "manufacturer", "vendor") ?? "",
    ).trim();
    const packetValue = Number(
      pick(record, "kismet.device.base.packets.total", "packets", "packet_count") ?? 0,
    );

    if (type.includes("bluetooth") || type.includes("ble") || type === "bt") {
      bluetooth.add(mac);
    } else {
      wifi.add(mac);
      if (channel) channels.add(channel);
      const normalizedFrequency = frequency > 100000 ? frequency / 1000 : frequency;
      const band = bandForFrequency(normalizedFrequency);
      if (band) bands.add(band);
    }

    if (vendor) vendors.add(vendor);
    if (Number.isFinite(packetValue) && packetValue > 0) packets += packetValue;
  }

  return {
    rows: records.length,
    wifi: wifi.size,
    bluetooth: bluetooth.size,
    channels: channels.size,
    bands: bands.size,
    vendors: vendors.size,
    gridCells: 0,
    gpsCoveragePct: 0,
    packets,
  };
}

function applyImport(summary: ImportSummary, source: "WiGLE" | "Kismet"): void {
  sources.add(source);
  lastImportRows = summary.rows;

  if (source === "WiGLE") {
    setValue("wifiTotal", summary.wifi);
    setValue("wifiNew", summary.wifi);
    setValue("bluetoothTotal", summary.bluetooth);
    setValue("bluetoothNew", summary.bluetooth);
    setValue("gpsCoveragePct", summary.gpsCoveragePct);
    setValue("newGridCells", summary.gridCells);
  } else {
    setValue("wifiTotal", Math.max(value("wifiTotal"), summary.wifi));
    setValue("wifiNew", Math.max(value("wifiNew"), summary.wifi));
    setValue("bluetoothTotal", Math.max(value("bluetoothTotal"), summary.bluetooth));
    setValue("bluetoothNew", Math.max(value("bluetoothNew"), summary.bluetooth));
    setValue("packetCount", Math.max(value("packetCount"), summary.packets));
  }

  setValue("uniqueChannels", Math.max(value("uniqueChannels"), summary.channels));
  setValue("bands", Math.max(value("bands"), summary.bands));
  setValue("vendors", Math.max(value("vendors"), summary.vendors));

  if (importStatusEl) {
    if (summary.rows === 0) {
      importStatusEl.textContent =
        source + " export loaded, but it contains 0 observation rows.";
    } else {
      importStatusEl.textContent =
        source +
        " loaded: " +
        summary.rows.toLocaleString() +
        " observations · " +
        summary.wifi.toLocaleString() +
        " Wi-Fi · " +
        summary.bluetooth.toLocaleString() +
        " Bluetooth.";
    }
  }

  if (saveButtonEl) {
    saveButtonEl.disabled = !persistenceConfigured || !selectedFile || summary.rows < 1;
  }
  render();
}

type PublicRun = {
  id: string;
  player_id: string;
  display_name: string;
  created_at: string;
  source_format: "wigle" | "kismet";
  verification: "capture-derived";
  score: number;
  grade: string;
  xp: number;
  novelty_pct: number;
  inputs: RunInputs;
  achievements: string[];
};

type PlayerResponse = {
  player: {
    display_name: string;
    total_xp: number;
    level: number;
    runs: number;
    best_score: number;
    best_grade: string;
    total_distance_km: number;
    unique_radios_seen: number;
    current_streak_days: number;
    longest_streak_days: number;
  };
  runs: PublicRun[];
  challenges: Array<{
    id: string;
    period: "daily" | "weekly";
    title: string;
    description: string;
    progress: number;
    target: number;
    unit: "radios" | "cells" | "xp" | "runs" | "bands";
    complete: boolean;
  }>;
};

type LeaderboardResponse = {
  players: Array<{
    player_id: string;
    display_name: string;
    total_xp: number;
    level: number;
    runs: number;
    best_score: number;
    best_grade: string;
    unique_radios_seen: number;
  }>;
};

function applyAuthoritativeRun(run: PublicRun): void {
  const input = run.inputs;
  setValue("distanceKm", input.distanceKm);
  setValue("durationMinutes", input.durationMinutes);
  setValue("gpsCoveragePct", input.gpsCoveragePct);
  setValue("wifiNew", input.wifiNew);
  setValue("wifiTotal", input.wifiTotal);
  setValue("bluetoothNew", input.bluetoothNew);
  setValue("bluetoothTotal", input.bluetoothTotal);
  setValue("packetCount", input.packetCount);
  setValue("uniqueChannels", input.uniqueChannels);
  setValue("bands", input.bands);
  setValue("vendors", input.vendors);
  setValue("newGridCells", input.newGridCells);
  sources.clear();
  sources.add(run.source_format === "wigle" ? "WiGLE" : "Kismet");
  render();
}

function renderPlayer(data: PlayerResponse): void {
  if (playerLevelEl) playerLevelEl.textContent = data.player.level.toLocaleString();
  if (playerXpEl) playerXpEl.textContent = data.player.total_xp.toLocaleString();
  if (playerRunsEl) playerRunsEl.textContent = data.player.runs.toLocaleString();
  if (playerRadiosEl) playerRadiosEl.textContent = data.player.unique_radios_seen.toLocaleString();
  if (playerBestEl) {
    playerBestEl.textContent = data.player.best_grade + " · " + data.player.best_score;
  }
  if (playerStreakEl) {
    playerStreakEl.textContent =
      data.player.current_streak_days + "d";
    playerStreakEl.title =
      "Longest streak: " + data.player.longest_streak_days + " days";
  }
  renderChallenges(data.challenges);
  if (!runHistoryEl) return;
  runHistoryEl.replaceChildren();
  if (data.runs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "si-empty";
    empty.innerHTML =
      '<span class="si-empty__mark">◇</span><span class="si-empty__title">No persisted runs yet.</span>';
    runHistoryEl.append(empty);
    return;
  }
  for (const run of data.runs.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "wd-run-row";
    const grade = document.createElement("span");
    grade.className = "wd-run-grade";
    grade.textContent = run.grade;
    const main = document.createElement("span");
    main.className = "wd-run-main";
    const title = document.createElement("strong");
    title.textContent = run.source_format.toUpperCase() + " · " + run.novelty_pct + "% new";
    const date = document.createElement("span");
    date.textContent = new Date(run.created_at).toLocaleString();
    main.append(title, date);
    const score = document.createElement("span");
    score.className = "wd-run-score";
    score.textContent = run.score + " SRR";
    const xp = document.createElement("span");
    xp.className = "wd-run-score";
    xp.textContent = "+" + run.xp.toLocaleString() + " XP";
    row.append(grade, main, score, xp);
    runHistoryEl.append(row);
  }
}

function renderChallenges(challenges: PlayerResponse["challenges"]): void {
  if (!challengesEl) return;
  challengesEl.replaceChildren();
  if (challenges.length === 0) {
    const empty = document.createElement("div");
    empty.className = "si-empty";
    empty.innerHTML =
      '<span class="si-empty__mark">◇</span><span class="si-empty__title">No active missions.</span>';
    challengesEl.append(empty);
    return;
  }

  for (const challenge of challenges) {
    const card = document.createElement("article");
    card.className =
      "wd-challenge" + (challenge.complete ? " wd-challenge--complete" : "");

    const copy = document.createElement("div");
    const period = document.createElement("span");
    period.className = "wd-challenge__period";
    period.textContent = challenge.complete
      ? challenge.period + " · complete"
      : challenge.period;
    const title = document.createElement("h3");
    title.textContent = challenge.title;
    const desc = document.createElement("p");
    desc.textContent = challenge.description;
    copy.append(period, title, desc);

    const progress = document.createElement("div");
    progress.className = "wd-challenge__progress";
    const line = document.createElement("div");
    line.className = "wd-challenge__progress-line";
    const value = document.createElement("span");
    value.style.width =
      Math.min(100, (challenge.progress / Math.max(challenge.target, 1)) * 100) + "%";
    line.append(value);
    const label = document.createElement("div");
    label.className = "wd-challenge__progress-label";
    const current = document.createElement("span");
    current.textContent = challenge.progress.toLocaleString() + " " + challenge.unit;
    const target = document.createElement("span");
    target.textContent = challenge.target.toLocaleString();
    label.append(current, target);
    progress.append(line, label);

    card.append(copy, progress);
    challengesEl.append(card);
  }
}

function renderLeaderboard(data: LeaderboardResponse): void {
  if (!leaderboardEl) return;
  leaderboardEl.replaceChildren();
  if (data.players.length === 0) {
    const empty = document.createElement("div");
    empty.className = "si-empty";
    empty.innerHTML =
      '<span class="si-empty__mark">◇</span><span class="si-empty__title">No ranked players yet.</span>';
    leaderboardEl.append(empty);
    return;
  }
  data.players.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "wd-leader-row";
    const rank = document.createElement("span");
    rank.className = "wd-leader-rank";
    rank.textContent = "#" + (index + 1);
    const main = document.createElement("span");
    main.className = "wd-leader-main";
    const name = document.createElement("strong");
    name.textContent = player.display_name;
    const meta = document.createElement("span");
    meta.textContent =
      "LV " + player.level + " · " + player.runs + " runs · best " + player.best_grade + " " + player.best_score;
    main.append(name, meta);
    const xp = document.createElement("span");
    xp.className = "wd-leader-xp";
    xp.textContent = player.total_xp.toLocaleString() + " XP";
    const radios = document.createElement("span");
    radios.className = "wd-leader-xp";
    radios.textContent = player.unique_radios_seen.toLocaleString() + " new radios";
    row.append(rank, main, xp, radios);
    leaderboardEl.append(row);
  });
}

async function refreshCommunity(): Promise<void> {
  if (!persistenceConfigured) return;
  try {
    const [playerRes, boardRes] = await Promise.all([
      fetch("/api/wardrive/player/me", {
        headers: {
          accept: "application/json",
          "x-wardrive-player-token": playerToken(),
        },
        cache: "no-store",
      }),
      fetch("/api/wardrive/leaderboard?limit=20", {
        headers: { accept: "application/json" },
        cache: "no-store",
      }),
    ]);
    if (playerRes.ok) renderPlayer((await playerRes.json()) as PlayerResponse);
    if (boardRes.ok) renderLeaderboard((await boardRes.json()) as LeaderboardResponse);
  } catch {
    if (persistenceChipEl) persistenceChipEl.textContent = "backend unavailable";
  }
}

async function loadPersistenceState(): Promise<void> {
  try {
    const res = await fetch("/api/wardrive/status", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body = (await res.json()) as { configured?: boolean; storage?: string };
    persistenceConfigured = Boolean(res.ok && body.configured && body.storage === "ok");
    if (persistenceChipEl && body.configured && body.storage === "down") {
      persistenceChipEl.textContent = "storage down";
    }
  } catch {
    persistenceConfigured = false;
  }

  if (persistenceChipEl) {
    if (persistenceChipEl.textContent !== "storage down") {
      persistenceChipEl.textContent = persistenceConfigured ? "persistent" : "local-only";
    }
    persistenceChipEl.classList.toggle("si-chip--live", persistenceConfigured);
  }
  if (saveButtonEl) {
    saveButtonEl.disabled = !persistenceConfigured || !selectedFile || lastImportRows < 1;
  }
  if (saveStatusEl && !persistenceConfigured) {
    saveStatusEl.textContent = "server persistence is not configured on this deployment";
  }
  if (persistenceConfigured) await refreshCommunity();
}

async function saveSelectedRun(): Promise<void> {
  if (!selectedFile || !persistenceConfigured) return;
  if (saveButtonEl) saveButtonEl.disabled = true;
  if (saveStatusEl) saveStatusEl.textContent = "server is parsing and deduplicating the capture…";
  try {
    const source =
      sources.size === 1
        ? Array.from(sources)[0] === "WiGLE"
          ? "wigle"
          : "kismet"
        : "";
    const res = await fetch("/api/wardrive/runs/import", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-wardrive-player-token": playerToken(),
        "x-wardrive-handle": currentHandle(),
        "x-wardrive-filename": encodeURIComponent(selectedFile.name),
        ...(source ? { "x-wardrive-source": source } : {}),
      },
      body: selectedFile,
    });
    const body = (await res.json()) as {
      run?: PublicRun;
      duplicate?: boolean;
      error?: string;
    };
    if (!res.ok || !body.run) throw new Error(body.error ?? "run save failed");
    applyAuthoritativeRun(body.run);
    if (saveStatusEl) {
      saveStatusEl.textContent =
        (body.duplicate ? "already saved · " : "saved · ") +
        body.run.grade +
        " " +
        body.run.score +
        " · +" +
        body.run.xp.toLocaleString() +
        " XP";
    }
    await refreshCommunity();
  } catch (error) {
    if (saveStatusEl) {
      saveStatusEl.textContent = error instanceof Error ? error.message : "run save failed";
    }
  } finally {
    if (saveButtonEl) {
      saveButtonEl.disabled = !persistenceConfigured || !selectedFile || lastImportRows < 1;
    }
  }
}

for (const input of fields.values()) input.addEventListener("input", render);
handleEl?.addEventListener("change", () => {
  currentHandle();
});
saveButtonEl?.addEventListener("click", () => {
  void saveSelectedRun();
});

fileEl?.addEventListener("change", async () => {
  const file = fileEl.files?.[0];
  if (!file) return;
  selectedFile = file;
  lastImportRows = 0;
  if (saveButtonEl) saveButtonEl.disabled = true;
  if (importStatusEl) importStatusEl.textContent = "reading " + file.name + "…";

  try {
    const text = await readText(file);
    const lower = file.name.toLowerCase();
    const isWigle = text.startsWith("WigleWifi-") || lower.endsWith(".csv") || lower.endsWith(".csv.gz");
    if (isWigle) applyImport(importWigle(text), "WiGLE");
    else applyImport(importKismet(text), "Kismet");
  } catch (error) {
    if (importStatusEl) {
      importStatusEl.textContent =
        error instanceof Error ? error.message : "Could not parse this capture.";
    }
  }
});

render();
void loadPersistenceState();
