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
 */

/** A short description of the failure that a result reports, or undefined when it reports none */
export function failureOf(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return undefined;
  }
  const record = result as Record<string, unknown>;
  const exitCode = record["exitCode"];
  if (typeof exitCode === "number" && exitCode !== 0) {
    return `exit code ${exitCode}`;
  }
  if (record["success"] === false) {
    return firstText(record["error"]) ?? firstText(record["errors"]) ?? firstText(record["message"]) ?? "success: false";
  }
  return undefined;
}

/** The first text of a value: a string, the message of an error object, or the first of a list */
function firstText(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstText(item);
      if (text) return text;
    }
    return undefined;
  }
  if (value && typeof value === "object" && typeof (value as { message?: unknown }).message === "string") {
    return (value as { message: string }).message;
  }
  return undefined;
}
