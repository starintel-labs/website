import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api/v1": { target: process.env.AUTO_DIG_API ?? "http://127.0.0.1:8788", changeOrigin: true },
    },
  },
});
