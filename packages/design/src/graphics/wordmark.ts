/**
 * Wordmark renderer: (name(λx.xx)) and the compact "name (λ)" form.
 * The lambda is the recurring visual motif of the design system; it renders
 * in accent gold against the obsidian canvas via .si-wordmark__lambda.
 */

import { brandTheme, wordmarkAria, type Brand, type BrandTheme } from "./brand.ts";

export const SYMBOLICS_WORDMARK = "(symbolics(λx.xx))";
export const STARINTEL_WORDMARK = "(starintel(λx.xx))";
export const STARINTEL_COMPACT = "starintel (λ)";

export interface WordmarkOptions {
  /** Brand key or an explicit BrandTheme override. */
  brand?: Brand | string;
  theme?: BrandTheme;
  size?: "sm" | "md" | "lg";
  /** Compact "name (λ)" form for tight chrome. */
  compact?: boolean;
}

function themeOf(options?: WordmarkOptions): BrandTheme {
  return options?.theme ?? brandTheme(options?.brand);
}

/** Render the wordmark as a DOM span. */
export function renderWordmark(options?: WordmarkOptions): HTMLElement {
  const theme = themeOf(options);
  const span = document.createElement("span");
  span.className = `si-wordmark si-wordmark--${options?.size ?? "md"}`;
  span.setAttribute("aria-label", wordmarkAria(theme));

  if (options?.compact) {
    const name = document.createElement("span");
    name.className = "si-wordmark__name";
    name.textContent = theme.name;
    const open = document.createElement("span");
    open.className = "si-wordmark__paren";
    open.textContent = " (";
    const lambda = document.createElement("span");
    lambda.className = "si-wordmark__lambda";
    lambda.textContent = "λ";
    const close = document.createElement("span");
    close.className = "si-wordmark__paren";
    close.textContent = ")";
    span.append(name, open, lambda, close);
    return span;
  }

  const open = document.createElement("span");
  open.className = "si-wordmark__paren";
  open.textContent = "(";
  const name = document.createElement("span");
  name.className = "si-wordmark__name";
  name.textContent = theme.name;
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
export function wordmarkHtml(
  brandOrCls: Brand | string = "starintel",
  cls = "",
  compact = false,
): string {
  // Accept ("starintel", "cls") or legacy ("cls") single-argument form.
  let theme: BrandTheme;
  let className = cls;
  if (brandOrCls.includes(" ") || brandOrCls.includes("si-")) {
    theme = brandTheme(undefined);
    className = brandOrCls;
  } else {
    theme = brandTheme(brandOrCls);
  }
  const inner = compact
    ? `<span class="si-wordmark__name">${theme.name}</span>` +
      `<span class="si-wordmark__paren"> (</span>` +
      `<span class="si-wordmark__lambda">λ</span>` +
      `<span class="si-wordmark__paren">)</span>`
    : `<span class="si-wordmark__paren">(</span>` +
      `<span class="si-wordmark__name">${theme.name}</span>` +
      `<span class="si-wordmark__paren">(</span>` +
      `<span class="si-wordmark__lambda">λ</span>x.xx` +
      `<span class="si-wordmark__paren">)</span>` +
      `<span class="si-wordmark__paren">)</span>`;
  return (
    `<span class="si-wordmark ${className}" aria-label="${wordmarkAria(theme)}">${inner}</span>`
  );
}
