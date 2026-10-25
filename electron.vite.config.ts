import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      commonjsOptions: { include: [/node_modules/, /safe-archive\.cjs/] },
      lib: {
        entry: resolve("electron/main.ts"),
      },
    },
    resolve: {
      alias: {
        "@core": resolve("core"),
        "@source-engine": resolve("source-engine"),
        "@browser-engine": resolve("browser-engine"),
        "@download-engine": resolve("download-engine"),
        "@apk-engine": resolve("apk-engine"),
        "@adb-engine": resolve("adb-engine"),
        "@security-engine": resolve("security-engine"),
        "@adapter-monitor": resolve("adapter-monitor"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve("electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: resolve("src"),
    build: {
      rollupOptions: {
        input: resolve("src/index.html"),
      },
    },
    resolve: {
      alias: {
        "@": resolve("src"),
      },
    },
    plugins: [react()],
    css: {
      postcss: resolve("postcss.config.js"),
    },
  },
});
