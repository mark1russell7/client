/**
 * @mark1russell7/test - Shared test utilities for the ecosystem
 *
 * @example
 * ```typescript
 * import { createTempDir, cleanupTempDir } from "@mark1russell7/test/fixtures";
 * import { createMockContext } from "@mark1russell7/test/mocks";
 * import { waitFor, sleep } from "@mark1russell7/test/utils";
 * ```
 */

// Re-export all utilities from a single entry point
export * from "./fixtures/index.js";
export * from "./mocks/index.js";
export * from "./utils/index.js";

// Export shared vitest config
export { sharedConfig } from "./vitest.shared.js";
