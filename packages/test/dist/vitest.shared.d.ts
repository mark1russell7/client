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
import type { UserConfig } from "vitest/config";
export declare const sharedConfig: UserConfig;
export default sharedConfig;
//# sourceMappingURL=vitest.shared.d.ts.map