import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const dir = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": dir("./src/shared"),
      "@": dir("./src/client"),
    },
  },
  test: {
    // Plain Node: its Blob survives fake-indexeddb's structured clone (jsdom's does not); setup adds localStorage.
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/client/__tests__/setup.ts"],
    restoreMocks: true,
  },
});
