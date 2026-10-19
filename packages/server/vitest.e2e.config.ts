import { defineConfig } from "vitest/config";

// The end-to-end test of the stop of the hosts (roadmap CI-2). It starts the built hosts as
// processes, sends SIGTERM and measures times. Thus only the CI job `lifecycle` starts it:
//   pnpm --filter @procedures/server exec vitest run --config vitest.e2e.config.ts
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 180000,
    hookTimeout: 30000,
  },
});
