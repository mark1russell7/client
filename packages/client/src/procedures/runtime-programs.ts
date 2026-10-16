/**
 * The handlers that `procedure.define` made, with the program (the aggregation) of each. The
 * registry is the only store of the procedures: a procedure is runtime-defined when its handler
 * is a key here. (Before, a separate map kept them, and `procedure.delete` removed only the map
 * entry: deep dive CORE-3.) The program is kept here, not only in the metadata: a caller that
 * gives its own metadata to `procedure.define` replaces the metadata.
 *
 * This module imports nothing, so the manifest (R17) and `procedure.define` can both use it
 * without an import cycle.
 */

const RUNTIME_PROGRAMS = new WeakMap<object, unknown>();

/** This function records the program of a handler that `procedure.define` made. */
export function markRuntimeProgram(handler: object, program: unknown): void {
  RUNTIME_PROGRAMS.set(handler, program);
}

/** True for a procedure that `procedure.define` made. */
export function isRuntimeDefined(procedure: { handler?: unknown }): boolean {
  return typeof procedure.handler === "function" && RUNTIME_PROGRAMS.has(procedure.handler);
}

/** The program of a handler that `procedure.define` made, or undefined. */
export function runtimeProgramOfHandler(handler: unknown): unknown {
  return typeof handler === "function" ? RUNTIME_PROGRAMS.get(handler) : undefined;
}
