import { defineConfig } from "vite";
import { resolve } from "node:path";

import { featureContent } from "./feature-content.ts";

export default defineConfig({
  plugins: [featureContent()],
  appType: "mpa",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        radar: resolve(__dirname, "radar.html"),
        research: resolve(__dirname, "research.html"),
      },
    },
  },
});
