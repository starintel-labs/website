/**
 * /radar client. Consumes the public-safe SSE stream and renders a live
 * sweep visualization. Frames are batched visually; aggregate counts always
 * reflect the full observed volume.
 */
import { renderWordmark } from "@starintel/design/wordmark";
import "@starintel/design/css/tokens.css";
import "@starintel/design/css/base.css";
import "@starintel/design/css/layout.css";
import "@starintel/design/css/components.css";
import "@starintel/design/css/motion.css";

const brand = document.querySelector<HTMLElement>("[data-wordmark]");
if (brand) brand.replaceChildren(renderWordmark({ size: "sm", compact: true }));
const foot = document.querySelector<HTMLElement>("[data-wordmark-sm]");
if (foot) foot.replaceChildren(renderWordmark({ size: "sm", compact: true }));

interface RadarEvent {
  t: string;
  family: string;
  kind: string;
  dtype?: string;
  size_bucket: "s" | "m" | "l" | "xl";
  count: number;
  type?: "event";
}

interface RadarRate {
  type: "rate";
  rps: number;
  total: number;
  families: Record<string, number>;
  sizes: Record<string, number>;
}

type RadarFrame = RadarEvent | RadarRate;

const FAMILY_COLORS: Record<string, string> = {
  document: "#e0b04a",
  actor: "#7fa8bd",
  system: "#7cae7f",
  unknown: "#655e50",
};
const SIZE_LABEL: Record<string, string> = { s: "<2KB", m: "2–64KB", l: "64KB–1MB", xl: ">1MB" };

const canvas = document.getElementById("radar-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const statusChip = document.getElementById("radar-status")!;
const rateEl = document.getElementById("radar-rate")!;
const totalEl = document.getElementById("radar-total")!;
const familiesEl = document.getElementById("radar-families")!;
const sizesEl = document.getElementById("radar-sizes")!;

const total = { events: 0, rps: 0 };
const familyCounts = new Map<string, number>();
const sizeCounts = new Map<string, number>();
const blips: { angle: number; radius: number; color: string; born: number }[] = [];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function setStatus(state: string, label: string): void {
  statusChip.dataset.state = state;
  statusChip.textContent = label;
}

function addEvent(ev: RadarEvent): void {
  total.events += ev.count;
  familyCounts.set(ev.family, (familyCounts.get(ev.family) ?? 0) + ev.count);
  sizeCounts.set(ev.size_bucket, (sizeCounts.get(ev.size_bucket) ?? 0) + ev.count);
  if (!reducedMotion) {
    const t = new Date(ev.t).getTime() || Date.now();
    const angle = (t % 60000) / 60000; // minute ring
    const radius = { s: 0.28, m: 0.5, l: 0.72, xl: 0.92 }[ev.size_bucket] ?? 0.5;
    blips.push({
      angle: angle * Math.PI * 2,
      radius,
      color: FAMILY_COLORS[ev.family] ?? FAMILY_COLORS.unknown!,
      born: performance.now(),
    });
  }
}

function renderStats(): void {
  rateEl.textContent = total.rps > 0 ? total.rps.toFixed(1) : "0.0";
  totalEl.textContent = `${total.events.toLocaleString("en-US")} events observed`;
  const famMax = Math.max(1, ...familyCounts.values());
  familiesEl.replaceChildren(
    ...[...familyCounts.entries()].map(([fam, n]) => {
      const row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:5.5rem 1fr 4rem;gap:0.6rem;align-items:center";
      const name = document.createElement("span");
      name.className = "mono";
      name.style.fontSize = "0.75rem";
      name.textContent = fam;
      const bar = document.createElement("div");
      bar.style.cssText = `height:8px;border-radius:4px;background:${FAMILY_COLORS[fam] ?? FAMILY_COLORS.unknown};width:${(n / famMax) * 100}%;opacity:0.85`;
      const cnt = document.createElement("span");
      cnt.className = "mono faint";
      cnt.style.fontSize = "0.72rem";
      cnt.textContent = n.toLocaleString("en-US");
      row.append(name, bar, cnt);
      return row;
    }),
  );
  sizesEl.replaceChildren(
    ...[...sizeCounts.entries()].map(([bucket, n]) => {
      const chip = document.createElement("span");
      chip.className = "si-chip";
      chip.textContent = `${SIZE_LABEL[bucket] ?? bucket}: ${n.toLocaleString("en-US")}`;
      return chip;
    }),
  );
}

function drawSweep(now: number): void {
  const w = canvas.width;
  const c = w / 2;
  const R = w / 2 - 24;
  ctx.clearRect(0, 0, w, w);

  ctx.fillStyle = "#0d0b08";
  ctx.beginPath();
  ctx.arc(c, c, R + 8, 0, Math.PI * 2);
  ctx.fill();

  // range rings
  ctx.strokeStyle = "rgba(82,69,42,0.9)";
  ctx.lineWidth = 1.5;
  for (const r of [0.28, 0.5, 0.72, 0.92]) {
    ctx.beginPath();
    ctx.arc(c, c, R * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // cross hairs
  ctx.strokeStyle = "rgba(82,69,42,0.55)";
  ctx.beginPath();
  ctx.moveTo(c - R, c);
  ctx.lineTo(c + R, c);
  ctx.moveTo(c, c - R);
  ctx.lineTo(c, c + R);
  ctx.stroke();

  // sweep
  const sweepAngle = ((now / 2400) % 1) * Math.PI * 2;
  const grad = ctx.createConicGradient?.(sweepAngle - 0.9, c, c);
  if (grad) {
    grad.addColorStop(0, "rgba(224,176,74,0)");
    grad.addColorStop(0.92, "rgba(224,176,74,0)");
    grad.addColorStop(1, "rgba(224,176,74,0.22)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, R, sweepAngle - 0.9, sweepAngle);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(224,176,74,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.lineTo(c + Math.cos(sweepAngle) * R, c + Math.sin(sweepAngle) * R);
  ctx.stroke();

  // blips
  const alive: typeof blips = [];
  for (const b of blips) {
    const age = (now - b.born) / 6000;
    if (age > 1) continue;
    alive.push(b);
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(c + Math.cos(b.angle) * R * b.radius, c + Math.sin(b.angle) * R * b.radius, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  blips.length = 0;
  blips.push(...alive.slice(-400));
}

let statsDirty = false;
function loop(now: number): void {
  drawSweep(now);
  if (statsDirty) {
    renderStats();
    statsDirty = false;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
setInterval(renderStats, 2000); // totals stay fresh even without new events

function connect(): void {
  const es = new EventSource("/radar/stream");
  es.onopen = () => setStatus("live", "live");
  es.onerror = () => {
    setStatus("reconnecting", "reconnecting");
    es.close();
    setTimeout(connect, 2500);
  };
  es.onmessage = (msg) => {
    let frame: RadarFrame;
    try {
      frame = JSON.parse(msg.data) as RadarFrame;
    } catch {
      return;
    }
    if (frame.type === "rate") {
      total.rps = frame.rps;
      if (frame.total > total.events) total.events = frame.total;
      for (const [f, n] of Object.entries(frame.families)) familyCounts.set(f, n);
      for (const [s, n] of Object.entries(frame.sizes)) sizeCounts.set(s, n);
    } else {
      addEvent(frame);
    }
    statsDirty = true;
  };
}

connect();
