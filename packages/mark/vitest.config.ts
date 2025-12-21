import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 60000,  // E2E tests need longer timeout (1 minute)
    hookTimeout: 30000,  // Setup/teardown timeout (30 seconds)
    globals: true,
  },
});
