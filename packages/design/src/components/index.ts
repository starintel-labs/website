/**
 * Framework-free component builders for the dynamic StarIntel surfaces.
 * Every builder emits plain DOM using the .si-* classes from
 * src/css/components.css. No framework, no virtual DOM, no wrapper soup.
 */

import { el } from "./dom.ts";
import { renderWordmark, type WordmarkOptions } from "../graphics/wordmark.ts";
import { brandTheme, type Brand } from "../graphics/brand.ts";

export interface CardOptions {
  href?: string;
  dtype?: string;
  title: string;
  desc?: string;
  meta?: string[];
  external?: boolean;
}

export function card(opts: CardOptions): HTMLElement {
  const inner: (Node | string)[] = [];
  if (opts.dtype) inner.push(el("span", { class: "si-card__dtype" }, opts.dtype));
  inner.push(el("span", { class: "si-card__title" }, opts.title));
  if (opts.desc) inner.push(el("span", { class: "si-card__desc" }, opts.desc));
  if (opts.meta && opts.meta.length > 0) {
    inner.push(
      el("span", { class: "si-card__meta" }, ...opts.meta.map((m) => el("span", {}, m))),
    );
  }
  const c = el(opts.href ? "a" : "div", { class: "si-card" }, ...inner);
  if (opts.href) {
    c.setAttribute("href", opts.href);
    if (opts.external) {
      c.setAttribute("rel", "noopener");
      c.setAttribute("target", "_blank");
    }
  }
  return c;
}

export type ChipVariant = "gold" | "accent" | "live" | "warn" | "danger";

export function chip(text: string, variant?: ChipVariant): HTMLElement {
  const cls = variant ? `si-chip si-chip--${variant}` : "si-chip";
  return el("span", { class: cls }, text);
}

export interface StatusOptions {
  state: "ok" | "warn" | "err" | "live" | "idle";
  label: string;
}

/** StatusDot with text: state is never conveyed by color alone. */
export function status(opts: StatusOptions): HTMLElement {
  return el(
    "span",
    { class: `si-status si-status--${opts.state}`, role: "status" },
    el("span", { class: "si-status__dot", "aria-hidden": "true" }),
    opts.label,
  );
}

export interface TopbarLink {
  href: string;
  label: string;
  active?: boolean;
  external?: boolean;
}

/** Build the shared topbar. active marks the aria-current page. */
export function topbar(
  brandHref: string,
  links: TopbarLink[],
  brand: Brand | string = "starintel",
  compactWordmark = true,
): HTMLElement {
  const brandEl = el("a", { class: "si-topbar__brand", href: brandHref });
  brandEl.replaceChildren(
    renderWordmark({ brand, size: "sm", compact: compactWordmark } satisfies WordmarkOptions),
  );
  const nav = el("nav", { class: "si-topbar__nav", "aria-label": "Primary" });
  for (const l of links) {
    const a = el("a", { href: l.href, "aria-current": l.active ? "page" : undefined }, l.label);
    if (l.external) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    }
    nav.append(a);
  }
  return el("header", { class: "si-topbar" }, brandEl, nav);
}

export function footer(
  note: string,
  links: { href: string; label: string }[] = [],
  brand: Brand | string = "starintel",
): HTMLElement {
  const shell = el("div", { class: "si-shell" });
  const left = el("span", {}, renderWordmark({ brand, size: "sm", compact: true }), ` — ${note}`);
  const right = el("span", { class: "si-footer__links" });
  for (const [i, l] of links.entries()) {
    if (i > 0) right.append(" · ");
    right.append(el("a", { href: l.href }, l.label));
  }
  shell.append(left, right);
  return el("footer", { class: "si-footer" }, shell);
}

export { brandTheme } from "../graphics/brand.ts";
export type { Brand } from "../graphics/brand.ts";
