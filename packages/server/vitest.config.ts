import { defineConfig } from "vitest/config";

// Unit tests (`pnpm test`). The end-to-end test of the stop of the hosts (e2e/) has its own
// configuration, vitest.e2e.config.ts: only the CI job `lifecycle` starts it.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
