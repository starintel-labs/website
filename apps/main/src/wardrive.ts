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

const sources = new Set<string>();

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
  const index = new Map(header.map((name, i) => [name, i]));
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

  render();
}

for (const input of fields.values()) input.addEventListener("input", render);

fileEl?.addEventListener("change", async () => {
  const file = fileEl.files?.[0];
  if (!file) return;
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
