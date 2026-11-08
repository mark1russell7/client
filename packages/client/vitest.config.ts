import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    testTimeout: 10000,
    hookTimeout: 10000,
    reporters: ["default"],
    // The tests of the bench gates run with the package, so a change to a gate meets its tests in each pull request.
    include: ["src/**/*.test.ts", "bench/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/index.ts",
      ],
    },
  },
});
