import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  appType: "mpa",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        radar: resolve(__dirname, "radar.html"),
      },
    },
  },
});
