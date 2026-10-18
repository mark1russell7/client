/**
 * The tool hints of a procedure with its override (CLI-10).
 *
 * The declared effects give the hints of a tool (`toolHints()`). A procedure can make its tool
 * look more dangerous with `metadata.toolHints`, for example `openWorldHint: true` for a store
 * that other people can read. An override cannot make a tool look safer than its effects:
 * the effects stay the truth, and the host enforces the effects, not the hints.
 *
 * The cautious value of each hint:
 * - `readOnlyHint: false`: the tool can change something.
 * - `destructiveHint: true`: the tool can delete or overwrite data.
 * - `idempotentHint: false`: a second call can change more.
 * - `openWorldHint: true`: the tool can reach systems outside the host.
 *
 * An override cannot give the other value, also when the effects give it. The registry refuses
 * such an override when the procedure registers.
 */

import type { AnyProcedure } from "./types.js";
import { toolHints, type ToolHints } from "./capability.js";

/**
 * The override of the hints of a tool. Each hint has only its cautious value, so the type refuses
 * the other value before the registry does.
 */
export interface ToolHintOverride {
  readonly readOnlyHint?: false | undefined;
  readonly destructiveHint?: true | undefined;
  readonly idempotentHint?: false | undefined;
  readonly openWorldHint?: true | undefined;
}

type HintName = keyof ToolHints;

/** The cautious value of each hint: the only value that an override can give. */
const CAUTIOUS: Readonly<Record<HintName, boolean>> = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const HINT_NAMES = Object.keys(CAUTIOUS) as HintName[];

/** The override of a procedure (`metadata.toolHints`), or undefined. */
export function toolHintOverrideOf(procedure: AnyProcedure): ToolHintOverride | undefined {
  const value = (procedure.metadata as { toolHints?: unknown } | undefined)?.toolHints;
  return value !== null && typeof value === "object" ? (value as ToolHintOverride) : undefined;
}

/**
 * The refusal of the override of a procedure, or undefined when the override is correct. An
 * override can give only the cautious value of a hint.
 */
export function toolHintOverrideRefusal(procedure: AnyProcedure): string | undefined {
  const value = (procedure.metadata as { toolHints?: unknown } | undefined)?.toolHints;
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "metadata.toolHints must be an object of hints";
  }
  for (const [name, hint] of Object.entries(value as Record<string, unknown>)) {
    if (hint === undefined) continue;
    if (!HINT_NAMES.includes(name as HintName)) {
      return `metadata.toolHints has an unknown hint "${name}". The hints are ${HINT_NAMES.join(", ")}`;
    }
    const cautious = CAUTIOUS[name as HintName];
    if (hint !== cautious) {
      return (
        `metadata.toolHints.${name} can only be ${String(cautious)}: an override can only make a tool look more ` +
        `dangerous than its effects. The declared effects give the other hints`
      );
    }
  }
  return undefined;
}

/**
 * The hints of the tool of a procedure: the hints of its effects, with the cautious values of
 * its override. A value of the override that is not cautious has no effect (the registry refuses
 * it at registration).
 */
export function toolHintsOf(procedure: AnyProcedure): ToolHints {
  const derived = toolHints(procedure);
  const override = toolHintOverrideOf(procedure);
  if (!override) return derived;
  const hints: { -readonly [name in HintName]?: boolean } = { ...derived };
  for (const name of HINT_NAMES) {
    if (override[name] === CAUTIOUS[name]) hints[name] = CAUTIOUS[name];
  }
  return hints;
}
