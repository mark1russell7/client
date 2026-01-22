/**
 * Output Formatting
 *
 * Formats procedure results for CLI output based on metadata hints.
 */

export type OutputFormat = "text" | "json" | "table" | "streaming";

/**
 * Print interface (used by formatOutput)
 */
export interface Print {
  info: (message: string) => void;
  error: (message: string) => void;
  success: (message: string) => void;
  warning: (message: string) => void;
  table: (data: string[][], options?: { format?: string }) => void;
  spin: (message: string) => Spinner;
}

export interface Spinner {
  stop: () => void;
  succeed: (message?: string) => void;
  fail: (message?: string) => void;
  text: string;
}

/**
 * Format and print the result based on output format hint
 */
export function formatOutput(
  print: Print,
  result: unknown,
  format: OutputFormat = "text"
): void {
  if (result === undefined || result === null) {
    return;
  }

  switch (format) {
    case "json":
      print.info(JSON.stringify(result, null, 2));
      break;

    case "table":
      formatTable(print, result);
      break;

    case "text":
    case "streaming":
    default:
      formatText(print, result);
      break;
  }
}

/**
 * Format as text - handles common result shapes
 */
function formatText(print: Print, result: unknown): void {
  // String output
  if (typeof result === "string") {
    print.info(result);
    return;
  }

  // Result with output field (common pattern)
  if (isObjectWithOutput(result)) {
    print.info(result.output);
    return;
  }

  // Result with message field
  if (isObjectWithMessage(result)) {
    if (result.success === false) {
      print.error(result.message);
    } else {
      print.success(result.message);
    }
    return;
  }

  // Result with error field
  if (isObjectWithError(result)) {
    print.error(result.error);
    return;
  }

  // Array of items
  if (Array.isArray(result)) {
    for (const item of result) {
      formatText(print, item);
    }
    return;
  }

  // Fallback to JSON
  print.info(JSON.stringify(result, null, 2));
}

/**
 * Format as table - handles arrays of objects
 */
function formatTable(print: Print, result: unknown): void {
  // Result with rows/headers
  if (isTableResult(result)) {
    const headers = result.headers ?? Object.keys(result.rows[0] ?? {});
    const data: string[][] = [headers];

    for (const row of result.rows) {
      if (Array.isArray(row)) {
        data.push(row.map(String));
      } else if (typeof row === "object" && row !== null) {
        data.push(headers.map((h) => String((row as Record<string, unknown>)[h] ?? "")));
      }
    }

    print.table(data);
    return;
  }

  // Plain array of objects
  if (Array.isArray(result) && result.length > 0 && typeof result[0] === "object") {
    const headers = Object.keys(result[0] as object);
    const data: string[][] = [headers];

    for (const row of result) {
      if (typeof row === "object" && row !== null) {
        data.push(headers.map((h) => String((row as Record<string, unknown>)[h] ?? "")));
      }
    }

    print.table(data);
    return;
  }

  // Fallback to text
  formatText(print, result);
}

// Type guards

function isObjectWithOutput(val: unknown): val is { output: string } {
  return (
    typeof val === "object" &&
    val !== null &&
    "output" in val &&
    typeof (val as { output: unknown }).output === "string"
  );
}

function isObjectWithMessage(val: unknown): val is { message: string; success?: boolean } {
  return (
    typeof val === "object" &&
    val !== null &&
    "message" in val &&
    typeof (val as { message: unknown }).message === "string"
  );
}

function isObjectWithError(val: unknown): val is { error: string } {
  return (
    typeof val === "object" &&
    val !== null &&
    "error" in val &&
    typeof (val as { error: unknown }).error === "string"
  );
}

function isTableResult(val: unknown): val is { rows: unknown[]; headers?: string[] } {
  return (
    typeof val === "object" &&
    val !== null &&
    "rows" in val &&
    Array.isArray((val as { rows: unknown }).rows)
  );
}
