/**
 * @mark1russell7/client-test
 *
 * Test execution procedures for the ecosystem.
 *
 * Provides procedures for running tests:
 * - test.run - Run tests (vitest)
 * - test.coverage - Run tests with coverage
 *
 * @example
 * ```typescript
 * // Run tests for a package
 * await client.call(["test", "run"], { cwd: "/path/to/package" });
 *
 * // Run with coverage
 * await client.call(["test", "coverage"], {
 *   cwd: "/path/to/package",
 *   threshold: 80
 * });
 *
 * // Use with dag.traverse to test all packages
 * await client.call(["dag", "traverse"], {
 *   visit: { $proc: ["test", "run"], input: {} }
 * });
 * ```
 */

// Importing the package registers its procedures, as in the other client packages (BUGS-2026-07 H18)
import "./register.js";

// Types
export type {
  TestRunInput,
  TestRunOutput,
  TestCoverageInput,
  TestCoverageOutput,
} from "./types.js";

export {
  TestRunInputSchema,
  TestCoverageInputSchema,
} from "./types.js";

// Procedures
export { testRun, testCoverage } from "./procedures/test/index.js";
