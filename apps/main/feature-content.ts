import { readFileSync } from "node:fs";

import type { Plugin } from "vite";
interface Feature {
  id: string;
  title: string;
  caption: string;
  description: string;
  status: string;
  image: string;
}

export function featureContent(): Plugin {
  return {
    name: "homepage-features",
    transformIndexHtml(html) {
      const features: Feature[] = JSON.parse(
        readFileSync(new URL("./src/features.json", import.meta.url), "utf8"),
      );
      const escape = (value: string) =>
        value.replace(
          /[&<>"']/g,
          (c) =>
            (
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              }) as Record<string, string>
            )[c]!,
        );
      const slides = features
        .map(
          (
            f,
            i,
          ) => `<figure class="si-feature-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${features.length}: ${escape(f.title)}">
    <div class="si-figure-label">fig. ${String(i + 1).padStart(2, "0")} / ${escape(f.title)}</div>
    <img src="${escape(f.image)}" alt="${escape(f.caption)}" width="760" height="420" />
    <figcaption><h2>${escape(f.title)}</h2><p>${escape(f.caption)}</p></figcaption>
  </figure>`,
        )
        .join("");
      const controls = `<div class="si-slider-controls" hidden><button type="button" data-prev aria-label="Previous figure">←</button><span class="si-slider-count" aria-live="off">01 / ${String(features.length).padStart(2, "0")}</span><button type="button" data-next aria-label="Next figure">→</button><button type="button" data-pause>Pause</button></div>`;

      return html
        .replace(
          "<!-- feature-slider -->",
          `<section class="si-feature-slider" aria-label="StarIntel features" aria-roledescription="carousel"><div class="si-feature-track">${slides}</div>${controls}</section>`,
        )
        .replace(
          "<!-- feature-cards -->",
          `<div class="si-grid si-grid--trio">${features.map((f) => `<article class="si-card si-card--open" id="${escape(f.id)}"><span class="si-card__dtype">${escape(f.id)}</span><h3 class="si-card__title">${escape(f.title)}</h3><p class="si-card__desc">${escape(f.description)}</p><span class="si-card__meta"><span class="si-badge${f.status === "in development" ? " si-badge--dev" : ""}">${escape(f.status)}</span></span></article>`).join("")}</div>`,
        );
    },
    configureServer(server) {
      server.watcher.add(
        new URL("./src/features.json", import.meta.url).pathname,
      );
      server.watcher.on("change", (file) => {
        if (file.endsWith("/features.json"))
          server.ws.send({ type: "full-reload" });
      });
    },
  };
}
