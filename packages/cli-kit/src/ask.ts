/**
 * Questions for missing arguments.
 *
 * When a person runs a program in a terminal and a required argument is missing, the program
 * asks for it. The question shows the name, the type and the description of the field. The
 * program does not ask when stdin or stdout is not a terminal, when the environment variable CI
 * is set, with `--no-input`, or when the procedure sets `interactive: false` in its CLI metadata.
 * Then a missing argument is an error of the input.
 */

import { convertValue, type CLIMeta, type SchemaFieldInfo } from "./fields.js";

/** The answer to one question: the text of the person, or `cancelled` */
export type Answer = { value: unknown } | { cancelled: true };

/** A function that asks one question. Tests give a fake. */
export type Asker = (field: SchemaFieldInfo, message: string) => Promise<Answer>;

/** The terminal state that decides if the program can ask */
export interface Terminal {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  env: Record<string, string | undefined>;
}

/** This function gives the terminal state of this process. */
export function processTerminal(): Terminal {
  return {
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
    env: process.env,
  };
}

/** This function gives true when the program can ask for a missing argument. */
export function canAsk(noInput: boolean, meta: CLIMeta, terminal: Terminal): boolean {
  if (noInput || meta.interactive === false) {
    return false;
  }
  const ci = terminal.env["CI"];
  if (ci !== undefined && ci !== "" && ci !== "false" && ci !== "0") {
    return false;
  }
  return terminal.stdinIsTTY && terminal.stdoutIsTTY;
}

/** The required fields that the input does not give (a field with a default is not missing) */
export function missingFields(fields: readonly SchemaFieldInfo[], input: Record<string, unknown>): SchemaFieldInfo[] {
  return fields.filter((field) => field.required && field.defaultValue === undefined && input[field.name] === undefined);
}

/** The question of a field: its name, its type and its description */
export function questionOf(field: SchemaFieldInfo): string {
  const many = field.fieldType.kind === "array" ? " (separate the values with spaces)" : "";
  const description = field.description ? `: ${field.description}` : "";
  return `${field.name} (${field.type})${description}${many}`;
}

/** The result of the questions: the input with the answers, or the reason to stop */
export type Asked =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; cancelled: boolean; error: string };

/**
 * Ask for each missing field, in order, and convert each answer by the type of its field. An
 * array field takes the words of the answer.
 */
export async function askMissing(
  missing: readonly SchemaFieldInfo[],
  input: Record<string, unknown>,
  ask: Asker
): Promise<Asked> {
  const result = { ...input };
  for (const field of missing) {
    const answer = await ask(field, questionOf(field));
    if ("cancelled" in answer) {
      return { ok: false, cancelled: true, error: "Cancelled" };
    }
    if (typeof answer.value !== "string") {
      result[field.name] = answer.value;
      continue;
    }
    const kind = field.fieldType.kind;
    if (kind === "array") {
      const words = answer.value.trim().split(/\s+/).filter((word) => word.length > 0);
      const item = field.fieldType.item ?? { kind: "any" as const };
      const values: unknown[] = [];
      for (const word of words) {
        const converted = convertValue(word, item, field.name);
        if (!converted.ok) return { ok: false, cancelled: false, error: converted.error };
        values.push(converted.value);
      }
      result[field.name] = values;
      continue;
    }
    const converted = convertValue(answer.value, field.fieldType, field.name);
    if (!converted.ok) {
      return { ok: false, cancelled: false, error: converted.error };
    }
    result[field.name] = converted.value;
  }
  return { ok: true, input: result };
}

/** The asker of the terminal: a yes/no question for a boolean, a choice for an enum, text otherwise */
export const terminalAsker: Asker = async (field, message) => {
  // The prompts load only when the program asks
  const prompts = await import("@clack/prompts");
  let value: unknown;
  if (field.fieldType.kind === "boolean") {
    value = await prompts.confirm({ message });
  } else if (field.fieldType.kind === "enum" && field.enumValues) {
    const options = field.enumValues.map((option) => ({ value: option, label: option }));
    value = await prompts.select({ message, options } as Parameters<typeof prompts.select>[0]);
  } else {
    value = await prompts.text({ message });
  }
  return prompts.isCancel(value) ? { cancelled: true } : { value };
};
