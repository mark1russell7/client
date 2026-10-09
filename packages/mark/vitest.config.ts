import { defineConfig } from "vitest/config";

// Unit tests (`pnpm test`). The end-to-end tests have their own configuration: vitest.e2e.config.ts.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
  },
});
