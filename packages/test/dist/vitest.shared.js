/**
 * Shared Vitest configuration for the ecosystem
 *
 * Usage in other packages:
 * ```typescript
 * // vitest.config.ts
 * import { defineConfig } from "vitest/config";
 * import { sharedConfig } from "@mark1russell7/test/vitest.shared";
 *
 * export default defineConfig({
 *   ...sharedConfig,
 *   test: {
 *     ...sharedConfig.test,
 *     include: ["src/**\/*.test.ts"],
 *   },
 * });
 * ```
 */
export const sharedConfig = {
    test: {
        // Global settings
        globals: false,
        environment: "node",
        // Timeouts
        testTimeout: 10000,
        hookTimeout: 10000,
        // Reporter
        reporters: ["default"],
        // Coverage settings
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
        // Pool settings for parallel execution
        pool: "threads",
        poolOptions: {
            threads: {
                singleThread: false,
            },
        },
    },
};
export default sharedConfig;
//# sourceMappingURL=vitest.shared.js.map