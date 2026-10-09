/**
 * Procedure Definition Procedure
 *
 * Meta-procedure that creates procedures at runtime from JSON aggregations.
 * Enables fully declarative procedure definition without native TypeScript code.
 *
 * @example
 * ```typescript
 * // Define a procedure that chains multiple steps
 * await client.call(["procedure", "define"], {
 *   path: ["my", "workflow"],
 *   aggregation: {
 *     $proc: ["client", "chain"],
 *     input: {
 *       steps: [
 *         { $proc: ["fs", "mkdir"], input: { path: { $ref: "input.dir" } } },
 *         { $proc: ["git", "init"], input: { cwd: { $ref: "input.dir" } } },
 *       ],
 *     },
 *   },
 * });
 *
 * // Now use the defined procedure
 * await client.call(["my", "workflow"], { dir: "/path/to/project" });
 * ```
 */

import { defineProcedure, validateProcedure } from "./define.js";
import { PROCEDURE_REGISTRY, assertValidPath } from "./registry.js";
import type {
  Procedure,
  ProcedurePath,
  ProcedureMetadata,
  ProcedureContext,
  AnyProcedure,
  ProcedureRegistryLike,
} from "./types.js";
import { anySchema } from "./core/schemas.js";
import {
  createRefScope,
  hydrateInput,
  isAnyProcedureRef,
  markDataDriven,
  rawInputRule,
  RUNS_REFS_TAG,
} from "./ref.js";

// =============================================================================
// Types
// =============================================================================

/**
 * JSON-serializable aggregation definition.
 * Represents a procedure call tree that will be executed when the procedure runs.
 */
export interface AggregationDefinition {
  /** Procedure to call */
  $proc: ProcedurePath;
  /** Input for the procedure (may contain $ref and nested $proc) */
  input: unknown;
  /** Optional name for output referencing */
  $name?: string;
}

/**
 * Input for defining a new procedure.
 */
export interface DefineProcedureInput {
  /** Path for the new procedure */
  path: ProcedurePath;

  /**
   * Aggregation definition - the procedure body as a JSON tree.
   * This gets executed when the procedure is called.
   */
  aggregation: AggregationDefinition;

  /**
   * Optional metadata for the procedure.
   */
  metadata?: ProcedureMetadata;

  /**
   * Whether to replace an existing procedure with this path.
   * Default: false (throws if procedure exists)
   */
  replace?: boolean;
}

/**
 * Output from defining a procedure.
 */
export interface DefineProcedureOutput {
  /** The path of the defined procedure */
  path: ProcedurePath;
  /** Whether an existing procedure was replaced */
  replaced: boolean;
}

// =============================================================================
// Aggregation Handler Factory
// =============================================================================

/**
 * Create a handler that executes an aggregation definition.
 *
 * The body runs as `exec()` runs a ref, with the same interpreter (`hydrateInput`). The scope of
 * the body has one name, `input`: the input of the procedure. So `{ $ref: "input.dir" }` reads a
 * field of the input, and `$last`, the step names, `item`, `acc` and `index` keep their meaning
 * inside the body. (Deep dive CORE-4: before, a first pass replaced every `$ref` with a field of
 * the input, so `$last` and the step names became undefined, and nested refs of a root that is
 * not control flow never ran.)
 */
function createAggregationHandler(
  aggregation: AggregationDefinition
): (input: unknown, ctx: ProcedureContext) => Promise<unknown> {
  return async (input: unknown, ctx: ProcedureContext): Promise<unknown> => {
    if (!ctx?.client) {
      throw new Error("procedure.define requires a client context to execute aggregations");
    }
    const scope = createRefScope();
    scope.outputs.set("input", input);
    return hydrateInput(aggregation, (path, value) => ctx.client.call(path, value), {
      scope,
      rawInput: rawInputRule(ctx.registry ?? PROCEDURE_REGISTRY),
    });
  };
}

// =============================================================================
// Runtime-Defined Procedures
// =============================================================================

/**
 * The handlers that `procedure.define` made. The registry is the only store of the procedures:
 * a procedure is runtime-defined when its handler is in this set. (Before, a separate map kept
 * them, and `procedure.delete` removed only the map entry: deep dive CORE-3.)
 */
const RUNTIME_HANDLERS = new WeakSet<object>();

/** True for a procedure that `procedure.define` made. */
export function isRuntimeDefined(procedure: { handler?: unknown }): boolean {
  return typeof procedure.handler === "function" && RUNTIME_HANDLERS.has(procedure.handler);
}

type RegistryOf = Pick<ProcedureRegistryLike, "get" | "getAll" | "unregister">;

/**
 * Get a runtime-defined procedure by path.
 */
export function getRuntimeProcedure(
  path: ProcedurePath,
  registry: RegistryOf = PROCEDURE_REGISTRY
): AnyProcedure | undefined {
  const procedure = registry.get(path);
  return procedure && isRuntimeDefined(procedure) ? procedure : undefined;
}

/**
 * Check if a runtime procedure exists.
 */
export function hasRuntimeProcedure(path: ProcedurePath, registry: RegistryOf = PROCEDURE_REGISTRY): boolean {
  return getRuntimeProcedure(path, registry) !== undefined;
}

/**
 * Get all runtime-defined procedures.
 */
export function getAllRuntimeProcedures(registry: RegistryOf = PROCEDURE_REGISTRY): AnyProcedure[] {
  return registry.getAll().filter(isRuntimeDefined);
}

/**
 * Clear all runtime-defined procedures.
 * Useful for testing.
 */
export function clearRuntimeProcedures(registry: RegistryOf = PROCEDURE_REGISTRY): void {
  for (const proc of getAllRuntimeProcedures(registry)) {
    registry.unregister(proc.path);
  }
}

// =============================================================================
// The procedure.define Procedure
// =============================================================================

/**
 * Metadata for the procedure.define procedure.
 */
interface DefineMetadata extends ProcedureMetadata {
  description: string;
  tags: string[];
  /** This is a meta-procedure that creates other procedures */
  metaProcedure: true;
}

/**
 * The procedure.define procedure.
 *
 * This is a meta-procedure that creates other procedures at runtime
 * from JSON aggregation definitions.
 *
 * The rules (deep dive CORE-3, MCP-4):
 * - The procedure goes into the caller's registry (`ctx.registry`).
 * - `replace: true` replaces only a procedure that `procedure.define` made. A code procedure
 *   stays: an MCP client cannot replace a tool or an internal procedure.
 * - The registry gets the procedure first. A define that fails leaves nothing.
 * - The new procedure is data-driven: with a server's `expose` rule, it calls only exposed paths.
 * - Its input is raw (the `runs-refs` tag): `exec()` does not run the body at definition time.
 */
export const defineProcedureProcedure: Procedure<
  DefineProcedureInput,
  DefineProcedureOutput,
  DefineMetadata
> = defineProcedure({
  path: ["procedure", "define"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Define a new procedure from an aggregation",
    tags: ["core", "meta", RUNS_REFS_TAG],
    metaProcedure: true,
  },
  handler: async (
    input: DefineProcedureInput,
    ctx: ProcedureContext
  ): Promise<DefineProcedureOutput> => {
    const { path, aggregation, metadata, replace } = input;
    const registry = ctx?.registry ?? PROCEDURE_REGISTRY;

    assertValidPath(path);
    if (!isAnyProcedureRef(aggregation)) {
      throw new Error('procedure.define: the aggregation must be a procedure ref: { "$proc": [...], "input": {...} }');
    }

    const pathKey = path.join(".");
    const existing = registry.get(path);
    if (existing && !isRuntimeDefined(existing)) {
      throw new Error(
        `A code procedure exists at path: ${pathKey}. procedure.define can replace only a procedure that procedure.define made.`
      );
    }
    if (existing && !replace) {
      throw new Error(`Procedure already exists at path: ${pathKey}`);
    }

    // Create the procedure
    const procedure: AnyProcedure = defineProcedure({
      path,
      input: anySchema,
      output: anySchema,
      metadata: metadata ?? {
        description: `Runtime-defined aggregation procedure`,
        generatedFrom: "procedure.define",
        aggregation,
      },
      handler: createAggregationHandler(aggregation),
    });

    // Its behavior comes from data: a server with an expose rule lets it call only exposed procedures
    markDataDriven(procedure);
    RUNTIME_HANDLERS.add(procedure.handler!);

    // Validate the procedure
    validateProcedure(procedure);

    // The registry is the store: exec()/call()/transports find the procedure there. See
    // documentation/BUGS-2026-07.md (H4).
    registry.register(procedure, { override: existing !== undefined });

    return {
      path,
      replaced: existing !== undefined,
    };
  },
});

// =============================================================================
// Additional Meta-Procedures
// =============================================================================

/**
 * Get a runtime-defined procedure by path.
 */
export const getProcedureProcedure: Procedure<
  { path: ProcedurePath },
  AnyProcedure | null,
  ProcedureMetadata
> = defineProcedure({
  path: ["procedure", "get"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Get a runtime-defined procedure by path",
    tags: ["core", "meta"],
  },
  handler: async (input: { path: ProcedurePath }, ctx?: ProcedureContext): Promise<AnyProcedure | null> => {
    return getRuntimeProcedure(input.path, ctx?.registry ?? PROCEDURE_REGISTRY) ?? null;
  },
});

/**
 * List all runtime-defined procedures.
 */
export const listProceduresProcedure: Procedure<
  Record<string, never>,
  { procedures: Array<{ path: ProcedurePath; metadata: ProcedureMetadata }> },
  ProcedureMetadata
> = defineProcedure({
  path: ["procedure", "list"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "List all runtime-defined procedures",
    tags: ["core", "meta"],
  },
  handler: async (
    _input: Record<string, never>,
    ctx?: ProcedureContext
  ): Promise<{ procedures: Array<{ path: ProcedurePath; metadata: ProcedureMetadata }> }> => {
    const procedures = getAllRuntimeProcedures(ctx?.registry ?? PROCEDURE_REGISTRY).map(proc => ({
      path: proc.path,
      metadata: proc.metadata,
    }));
    return { procedures };
  },
});

/**
 * Delete a runtime-defined procedure.
 */
export const deleteProcedureProcedure: Procedure<
  { path: ProcedurePath },
  { deleted: boolean },
  ProcedureMetadata
> = defineProcedure({
  path: ["procedure", "delete"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Delete a runtime-defined procedure",
    tags: ["core", "meta"],
  },
  handler: async (input: { path: ProcedurePath }, ctx?: ProcedureContext): Promise<{ deleted: boolean }> => {
    const registry = ctx?.registry ?? PROCEDURE_REGISTRY;
    const existing = registry.get(input.path);
    if (!existing) {
      return { deleted: false };
    }
    // A code procedure stays (deep dive CORE-3: before, delete only forgot the runtime record)
    if (!isRuntimeDefined(existing)) {
      throw new Error(
        `procedure.delete removes only a procedure that procedure.define made: ${input.path.join(".")} is a code procedure.`
      );
    }
    return { deleted: registry.unregister(input.path) };
  },
});

// =============================================================================
// Export All Meta-Procedures
// =============================================================================

/**
 * All meta-procedures for procedure management.
 */
export const metaProcedures: AnyProcedure[] = [
  defineProcedureProcedure as AnyProcedure,
  getProcedureProcedure as AnyProcedure,
  listProceduresProcedure as AnyProcedure,
  deleteProcedureProcedure as AnyProcedure,
];
