/**
 * Symbolics wordmark: (symbolics(λx.xx))
 * The major visual identity of StarIntel's symbolic AI positioning.
 */

export const SYMBOLICS_WORDMARK = "(symbolics(λx.xx))";

/**
 * Render the Symbolics wordmark as a span.
 * The lambda is highlighted gold with a subtle glow.
 */
export function renderWordmark(options?: {
  size?: "sm" | "md" | "lg";
}): HTMLElement {
  const span = document.createElement("span");
  span.className = `si-wordmark si-wordmark--${options?.size ?? "md"}`;
  span.setAttribute("aria-label", "symbolics lambda x dot x x");

  const open = document.createElement("span");
  open.className = "si-wordmark__paren";
  open.textContent = "(";
  const name = document.createElement("span");
  name.className = "si-wordmark__name";
  name.textContent = "symbolics";
  const innerOpen = document.createElement("span");
  innerOpen.className = "si-wordmark__paren";
  innerOpen.textContent = "(";
  const lambda = document.createElement("span");
  lambda.className = "si-wordmark__lambda";
  lambda.textContent = "λ";
  const body = document.createElement("span");
  body.textContent = "x.xx";
  const innerClose = document.createElement("span");
  innerClose.className = "si-wordmark__paren";
  innerClose.textContent = ")";
  const close = document.createElement("span");
  close.className = "si-wordmark__paren";
  close.textContent = ")";

  span.append(open, name, innerOpen, lambda, body, innerClose, close);
  return span;
}

/** Static HTML string form (for server-side/static templates). */
export function wordmarkHtml(cls = ""): string {
  return (
    `<span class="si-wordmark ${cls}" aria-label="symbolics lambda x dot x x">` +
    `<span class="si-wordmark__paren">(</span>` +
    `<span class="si-wordmark__name">symbolics</span>` +
    `<span class="si-wordmark__paren">(</span>` +
    `<span class="si-wordmark__lambda">λ</span>x.xx` +
    `<span class="si-wordmark__paren">)</span>` +
    `<span class="si-wordmark__paren">)</span>` +
    `</span>`
  );
}
