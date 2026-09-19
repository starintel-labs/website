import { renderWordmark } from "@starintel/design/wordmark";
import "@starintel/design/css/tokens.css";
import "@starintel/design/css/base.css";
import "@starintel/design/css/layout.css";
import "@starintel/design/css/components.css";
import "@starintel/design/css/motion.css";

for (const el of document.querySelectorAll<HTMLElement>("[data-wordmark]")) {
  el.replaceChildren(renderWordmark({ size: "sm", compact: true }));
}
for (const el of document.querySelectorAll<HTMLElement>("[data-wordmark-sm]")) {
  el.replaceChildren(renderWordmark({ size: "sm", compact: true }));
}

interface ResearchStatus {
  configured: boolean;
  status: "ok" | "down" | "off";
}

async function loadStatus(): Promise<void> {
  const value = document.getElementById("research-runtime");
  const detail = document.getElementById("research-runtime-detail");
  if (!value || !detail) return;
  try {
    const res = await fetch("/api/research/status", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as ResearchStatus;
    value.textContent = body.status;
    detail.textContent =
      body.status === "ok"
        ? "Harness health is reachable. Authenticated run control stays on admin.starintel.actor."
        : body.status === "off"
          ? "This website instance has no Auto Research upstream configured."
          : "The harness health projection is currently unavailable; public research pages remain readable.";
  } catch {
    value.textContent = "down";
    detail.textContent = "The bounded health projection is unavailable. No privileged fallback is attempted.";
  }
}

void loadStatus();
