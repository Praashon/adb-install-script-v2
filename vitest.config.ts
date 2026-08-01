import { defineConfig } from "vitest/config";
import { resolve } from "path";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "core/**/*.ts",
        "source-engine/**/*.ts",
        "download-engine/**/*.ts",
        "apk-engine/**/*.ts",
        "adb-engine/**/*.ts",
        "security-engine/**/*.ts",
        "adapter-monitor/**/*.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@core": resolve(__dirname, "core"),
      "@source-engine": resolve(__dirname, "source-engine"),
      "@browser-engine": resolve(__dirname, "browser-engine"),
      "@download-engine": resolve(__dirname, "download-engine"),
      "@apk-engine": resolve(__dirname, "apk-engine"),
      "@adb-engine": resolve(__dirname, "adb-engine"),
      "@security-engine": resolve(__dirname, "security-engine"),
      "@adapter-monitor": resolve(__dirname, "adapter-monitor"),
    },
  },
});
