import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: resolve("src"),
  resolve: { alias: { "@": resolve("src") } },
  plugins: [react()],
  css: { postcss: resolve("postcss.config.js") },
  server: { port: 5199 },
});
