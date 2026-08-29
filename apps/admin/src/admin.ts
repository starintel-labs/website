/** StarIntel admin console: Auto Dig run coordination. No fake data — every
 * panel reflects a live API response or an explicit error state. */
import { renderWordmark } from "@starintel/ui/symbolics";
import "@starintel/ui/css/tokens.css";
import "@starintel/ui/css/base.css";
import "@starintel/ui/css/layout.css";

const brand = document.querySelector<HTMLElement>("[data-wordmark]");
if (brand) brand.replaceChildren(renderWordmark({ size: "sm" }));
const foot = document.querySelector<HTMLElement>("[data-wordmark-sm]");
if (foot) foot.replaceChildren(renderWordmark({ size: "sm" }));
document.querySelector<HTMLAnchorElement>(".si-topbar__brand")?.setAttribute("href", "/");

const apiStatus = document.getElementById("api-status")!;
const runsBody = document.getElementById("runs-body") as HTMLTableSectionElement;

function setStatus(state: string, label: string): void {
  apiStatus.dataset.state = state;
  apiStatus.textContent = label;
}

const STATE_COLORS: Record<string, string> = {
  created: "var(--si-cyan)",
  running: "var(--si-success)",
  paused: "var(--si-warning)",
  stopped: "var(--si-faint)",
  completed: "var(--si-gold)",
  failed: "var(--si-danger)",
  "on-disk": "var(--si-faint)",
};

const ACTIONS: Record<string, string[]> = {
  created: ["start", "stop"],
  running: ["pause", "stop"],
  paused: ["resume", "stop"],
  stopped: [],
  completed: [],
  failed: [],
  "on-disk": [],
};

interface RunRecord {
  run_id: string;
  target?: string;
  state: string;
  updated_at?: string;
  progress?: { documents?: number; notes?: string };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function idempotencyKey(runId: string, action: string): string {
  return `${runId}:${action}:${Date.now()}`;
}

async function runAction(runId: string, action: string): Promise<void> {
  await api(`/runs/${runId}/${action}`, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey(runId, action) },
  });
  await refresh();
}

async function refresh(): Promise<void> {
  try {
    const [caps, runs, ready] = await Promise.all([
      api<{ backend_version: string; schema_version: string; dtypes: string[] }>("/capabilities"),
      api<{ runs: RunRecord[] }>("/runs"),
      api<{ status: string; checks: Record<string, string> }>("/readyz").catch(() => ({
        status: "unreachable",
        checks: {},
      })),
    ]);
    setStatus("live", "live");
    (document.getElementById("health-backend") as HTMLElement).textContent = `v${caps.backend_version}`;
    (document.getElementById("health-schema") as HTMLElement).textContent = `v${caps.schema_version}`;
    (document.getElementById("health-dtypes") as HTMLElement).textContent = String(caps.dtypes.length);
    (document.getElementById("health-ready") as HTMLElement).textContent = ready.status;

    runsBody.replaceChildren();
    if (runs.runs.length === 0) {
      const row = runsBody.insertRow();
      row.innerHTML = `<td colspan="6" style="padding:1rem" class="muted">No runs discovered or recorded.</td>`;
      return;
    }
    for (const r of runs.runs) {
      const row = runsBody.insertRow();
      const color = STATE_COLORS[r.state] ?? "var(--si-faint)";
      const actions = (ACTIONS[r.state] ?? [])
        .map(
          (a) =>
            `<button class="si-chip" data-run="${r.run_id}" data-action="${a}" style="cursor:pointer">${a}</button>`,
        )
        .join(" ");
      row.innerHTML = `
        <td style="padding:0.65rem 1rem; color:var(--si-text-strong)">${r.run_id}</td>
        <td style="padding:0.65rem 1rem">${r.target ?? "—"}</td>
        <td style="padding:0.65rem 1rem; color:${color}">${r.state}</td>
        <td style="padding:0.65rem 1rem">${r.progress?.documents ?? "—"}</td>
        <td style="padding:0.65rem 1rem">${(r.updated_at ?? "—").slice(0, 19)}</td>
        <td style="padding:0.65rem 1rem">${actions || "—"}</td>`;
    }
    for (const btn of runsBody.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
      btn.addEventListener("click", () => {
        void runAction(btn.dataset.run!, btn.dataset.action!).catch((e) => {
          setStatus("down", `error: ${e.message}`);
        });
      });
    }
  } catch (e) {
    setStatus("down", "down");
    runsBody.replaceChildren();
    const row = runsBody.insertRow();
    row.innerHTML = `<td colspan="6" style="padding:1rem" class="muted">Backend unreachable: ${(e as Error).message}</td>`;
  }
}

document.getElementById("refresh")!.addEventListener("click", () => void refresh());
void refresh();
setInterval(() => void refresh(), 15000);
