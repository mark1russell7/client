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
import type {
  Procedure,
  ProcedurePath,
  ProcedureMetadata,
  ProcedureContext,
  AnyProcedure,
} from "./types.js";
import { anySchema } from "./core/schemas.js";

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
 * The handler:
 * 1. Takes the procedure input
 * 2. Walks the aggregation tree
 * 3. Resolves $ref references to input values
 * 4. Executes $proc calls via the client
 * 5. Returns the final result
 */
function createAggregationHandler(
  aggregation: AggregationDefinition
): (input: unknown, ctx: ProcedureContext) => Promise<unknown> {
  return async (input: unknown, ctx: ProcedureContext): Promise<unknown> => {
    // Resolve the aggregation tree with the input context
    const resolvedInput = resolveInputRefs(aggregation.input, { input });

    // Execute the root procedure
    if (!ctx.client) {
      throw new Error("procedure.define requires a client context to execute aggregations");
    }

    return ctx.client.call(aggregation.$proc, resolvedInput);
  };
}

/**
 * Resolve $ref placeholders in an input tree.
 *
 * Supports:
 * - { $ref: "input.path.to.value" } - reference to input field
 * - { $ref: "$last" } - reference to last result (in chains)
 * - Nested objects and arrays
 */
function resolveInputRefs(
  value: unknown,
  context: { input: unknown; last?: unknown }
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle $ref objects
  if (typeof value === "object" && value !== null && "$ref" in value) {
    const ref = (value as { $ref: string }).$ref;
    return resolveRefPath(ref, context);
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(item => resolveInputRefs(item, context));
  }

  // Handle objects
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = resolveInputRefs(val, context);
    }
    return result;
  }

  // Primitives pass through
  return value;
}

/**
 * Resolve a dot-separated path against a context object.
 */
function resolveRefPath(
  path: string,
  context: { input: unknown; last?: unknown }
): unknown {
  const parts = path.split(".");
  let current: unknown;

  // Handle special prefixes
  if (parts[0] === "input") {
    current = context.input;
    parts.shift();
  } else if (parts[0] === "$last") {
    current = context.last;
    parts.shift();
  } else {
    // Assume it's an input reference
    current = context.input;
  }

  // Navigate the path
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// =============================================================================
// Registry for Runtime-Defined Procedures
// =============================================================================

/**
 * Storage for runtime-defined procedures.
 * Maps path key to procedure definition.
 */
const runtimeProcedures = new Map<string, AnyProcedure>();

/**
 * Get a runtime-defined procedure by path.
 */
export function getRuntimeProcedure(path: ProcedurePath): AnyProcedure | undefined {
  return runtimeProcedures.get(path.join("."));
}

/**
 * Check if a runtime procedure exists.
 */
export function hasRuntimeProcedure(path: ProcedurePath): boolean {
  return runtimeProcedures.has(path.join("."));
}

/**
 * Get all runtime-defined procedures.
 */
export function getAllRuntimeProcedures(): AnyProcedure[] {
  return Array.from(runtimeProcedures.values());
}

/**
 * Clear all runtime-defined procedures.
 * Useful for testing.
 */
export function clearRuntimeProcedures(): void {
  runtimeProcedures.clear();
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
    tags: ["core", "meta"],
    metaProcedure: true,
  },
  handler: async (
    input: DefineProcedureInput,
    _ctx: ProcedureContext
  ): Promise<DefineProcedureOutput> => {
    const { path, aggregation, metadata, replace } = input;

    // Check if procedure already exists
    const pathKey = path.join(".");
    const exists = runtimeProcedures.has(pathKey);

    if (exists && !replace) {
      throw new Error(`Procedure already exists at path: ${pathKey}`);
    }

    // Create the aggregation handler
    const handler = createAggregationHandler(aggregation);

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
      handler,
    });

    // Validate the procedure
    validateProcedure(procedure);

    // Register in runtime storage
    runtimeProcedures.set(pathKey, procedure);

    return {
      path,
      replaced: exists,
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
  handler: async (input: { path: ProcedurePath }): Promise<AnyProcedure | null> => {
    return getRuntimeProcedure(input.path) ?? null;
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
  handler: async (): Promise<{ procedures: Array<{ path: ProcedurePath; metadata: ProcedureMetadata }> }> => {
    const procedures = getAllRuntimeProcedures().map(proc => ({
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
  handler: async (input: { path: ProcedurePath }): Promise<{ deleted: boolean }> => {
    const pathKey = input.path.join(".");
    const deleted = runtimeProcedures.delete(pathKey);
    return { deleted };
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
