/**
 * Effect declarations for groups of procedures (CAPABILITIES-2026-10). This file imports only
 * types, so each file of procedures can use it without an import cycle.
 */

import type { AnyProcedure, Effects } from "./types.js";

/** The effects of a procedure that reads and changes nothing: its output comes from its input. */
export const PURE_EFFECTS: Effects = Object.freeze({ reads: Object.freeze([]), writes: Object.freeze([]) });

/** The effects of a procedure that reads the procedure registry and changes nothing. */
export const REGISTRY_READ_EFFECTS: Effects = Object.freeze({ reads: Object.freeze(["registry"]), writes: Object.freeze([]) });

/**
 * The metadata key of the effects that a host found for the body of `procedure.define`
 * (`programCheckInterceptor` of `@procedures/compiler`, roadmap R22). The key starts with `__`, so
 * each transport removes it from a request: only an interceptor of the host can set it.
 */
export const INFERRED_EFFECTS_METADATA_KEY = "__inferredEffects";

function isNameList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((name) => typeof name === "string");
}

/**
 * The effects that a host found for a data-driven procedure (`metadata.inferredEffects`), or
 * undefined. They are information for the tool hints and the explanations. The admission still
 * examines each nested call of the procedure.
 */
export function inferredEffectsOf(source: { readonly metadata?: unknown } | Record<string, unknown> | undefined): Effects | undefined {
  const metadata = source && "metadata" in source ? (source as { metadata?: unknown }).metadata : source;
  const value = (metadata as { inferredEffects?: unknown } | undefined)?.inferredEffects;
  return effectsValue(value);
}

/** An `Effects` value with known reads and writes, or undefined. */
export function effectsValue(value: unknown): Effects | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const { reads, writes, destructive, idempotent } = value as Record<string, unknown>;
  if (!isNameList(reads) || !isNameList(writes)) return undefined;
  return Object.freeze({
    reads: Object.freeze([...reads]),
    writes: Object.freeze([...writes]),
    ...(typeof destructive === "boolean" ? { destructive } : {}),
    ...(typeof idempotent === "boolean" ? { idempotent } : {}),
  });
}

/**
 * This function gives copies of the procedures with the effects in their metadata. A procedure
 * that declares its own effects keeps them.
 */
export function withEffects<T extends AnyProcedure>(effects: Effects, procedures: readonly T[]): T[] {
  return procedures.map((procedure) =>
    (procedure.metadata as { effects?: unknown } | undefined)?.effects !== undefined
      ? procedure
      : ({ ...procedure, metadata: { ...procedure.metadata, effects } } as T)
  );
}
