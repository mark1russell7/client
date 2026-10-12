/**
 * The output schemas of the core procedures (roadmap 2.1).
 *
 * Before, every core procedure declared a pass-through output, so a wrong output went through,
 * the MCP tools had no output schema, and `mark --help` could not show the result. These
 * helpers give each output a real zod 4 schema with a description.
 */

import { z } from "zod";

/**
 * Any JavaScript number, also `NaN` and `Infinity`. zod 4's `z.number()` refuses both, but
 * `client.divide` by 0, `client.sqrt` of a negative number and `client.pow` can give them (the
 * Composer shows them). The JSON Schema is `{ "type": "number" }`.
 */
export function numberOutput(description: string): z.ZodType<number> {
  return z
    .custom<number>((value) => typeof value === "number", { message: "Expected a number" })
    .meta({ type: "number", description });
}

/** A string result. */
export function stringOutput(description: string): z.ZodType<string> {
  return z.string().describe(description);
}

/** A boolean result. */
export function booleanOutput(description: string): z.ZodType<boolean> {
  return z.boolean().describe(description);
}

/**
 * A result whose shape depends on the input or on the program: any JSON value (also
 * `undefined`). Its JSON Schema is `{}`, so an MCP client gets no output schema for it.
 */
export function anyOutput(description: string): z.ZodType<unknown> {
  return z.unknown().describe(description);
}

/** An array of any values. */
export function arrayOutput(description: string): z.ZodType<unknown[]> {
  return z.array(z.unknown()).describe(description);
}

/** An object with string keys and any values. */
export function recordOutput(description: string): z.ZodType<Record<string, unknown>> {
  return z.record(z.string(), z.unknown()).describe(description);
}
