/** Shared DOM component helpers (no framework; ships with static + dynamic apps). */

export interface CardOptions {
  href?: string;
  dtype?: string;
  title: string;
  desc?: string;
  meta?: string[];
  external?: boolean;
}

export function el(
  tag: string,
  attrs: Record<string, string | undefined> = {},
  ...children: (Node | string)[]
): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) node.setAttribute(k, v);
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function card(opts: CardOptions): HTMLElement {
  const inner: (Node | string)[] = [];
  if (opts.dtype) inner.push(el("span", { class: "si-card__dtype" }, opts.dtype));
  inner.push(el("span", { class: "si-card__title" }, opts.title));
  if (opts.desc) inner.push(el("span", { class: "si-card__desc" }, opts.desc));
  if (opts.meta && opts.meta.length > 0) {
    inner.push(
      el(
        "span",
        { class: "si-card__meta" },
        ...opts.meta.map((m) => el("span", {}, m)),
      ),
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

export function chip(
  text: string,
  variant?: "gold" | "cyan" | "live",
): HTMLElement {
  const cls = variant ? `si-chip si-chip--${variant}` : "si-chip";
  return el("span", { class: cls }, text);
}

/** Build a shared topbar. active marks the aria-current page. */
export function topbar(
  brandHref: string,
  links: { href: string; label: string; active?: boolean; external?: boolean }[],
  brand: Brand | string = "starintel",
): HTMLElement {
  const brandEl = el("a", { class: "si-topbar__brand", href: brandHref });
  import("./symbolics.js").then(({ renderWordmark }) => {
    brandEl.replaceChildren(renderWordmark({ brand, size: "sm" }));
  });
  const nav = el("nav", { class: "si-topbar__nav", "aria-label": "Primary" });
  for (const l of links) {
    const a = el(
      "a",
      { href: l.href, "aria-current": l.active ? "page" : undefined },
      l.label,
    );
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
  const left = el("span", {}, note);
  const right = el("span", { class: "si-footer__links" });
  for (const [i, l] of links.entries()) {
    if (i > 0) right.append(" · ");
    right.append(el("a", { href: l.href }, l.label));
  }
  shell.append(left, right);
  return el("footer", { class: "si-footer" }, shell);
}

export { brandTheme } from "./brand.ts";
import type { Brand } from "./brand.ts";
