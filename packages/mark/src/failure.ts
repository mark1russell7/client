/**
 * Procedure-level failure
 *
 * A procedure reports a failure in one of three ways, and `mark` exits with code 1 for each:
 *
 * 1. It throws an error. This is the usual way.
 * 2. It returns an object with `success: false`. Use this when the result has more to show,
 *    for example the list of problems of `lib audit`.
 * 3. It returns an object with a numeric `exitCode` that is not 0. Use this for a procedure that
 *    runs an external command (`vitest run`, `shell run`), so the caller sees the command's result.
 *
 * For a streaming procedure, each item is examined: one failed item makes the command fail.
 *
 * The code is in `@procedures/cli-kit` (roadmap O61).
 */

export { failureOf } from "@procedures/cli-kit";
