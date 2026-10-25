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
  Effects,
} from "./types.js";
import { z } from "zod";
import { anySchema, zodAdapter } from "./core/schemas.js";
import { keyToPath, pathToKey } from "./types.js";
import {
  createRefScope,
  isAnyProcedureRef,
  markDataDriven,
  rawInputRule,
  RUNS_REFS_TAG,
} from "./ref.js";
import { hydrateInput, runProgram } from "./program.js";
import { INFERRED_EFFECTS_METADATA_KEY, PURE_EFFECTS, REGISTRY_READ_EFFECTS, effectsValue, withEffects } from "./effects.js";
import { MANIFEST_FORMAT, describeProcedure as describeEntry, describeRegistry, type ProcedureManifest } from "./manifest.js";
import type { JsonSchema } from "./schema.js";
import { isRuntimeDefined, markRuntimeProgram, runtimeProgramOfHandler } from "./runtime-programs.js";
import { InvocationError } from "./invoke.js";

// Input schemas of procedure.define and procedure.delete (roadmap 2.1)
const procedurePathField = z.array(z.string().min(1)).min(1);
const defineInputSchema = z.object({
  path: procedurePathField.describe('The path of the new procedure, for example ["tools", "double"]'),
  aggregation: z
    .looseObject({
      $proc: z.array(z.string().min(1)).min(1).describe("The path of the procedure that the body calls"),
      input: z.unknown().optional().describe("The input of that call. It reads the input of the new procedure as { $ref: \"input.<field>\" }."),
      $name: z.string().optional().describe("A name that a $ref can read"),
    })
    .describe("The body of the procedure: a call ({ $proc, input }) that runs, as client.exec runs it, each time the procedure is called"),
  metadata: z.record(z.string(), z.unknown()).optional().describe("The metadata of the procedure, for example { description, tags }"),
  replace: z.boolean().optional().describe("Replace a procedure that procedure.define made at the same path (never a procedure of code)"),
});
const deleteInputSchema = z.object({
  path: procedurePathField.describe("The path of the procedure to delete (only a procedure that procedure.define made)"),
});

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

/** The JSON form of a `ProcedureDescription`, for the output schemas of `procedure.get`/`list`. */
const descriptionFields = {
  path: z.array(z.string()).describe("The path of the procedure"),
  key: z.string().describe("The path as a dotted key"),
  description: z.string().optional().describe("The description of the metadata"),
  tags: z.array(z.string()).optional().describe("The tags of the metadata"),
  hasHandler: z.boolean().describe("True when the procedure has a handler (it can run)"),
  runtime: z.boolean().describe("True for a procedure that procedure.define made"),
  metadata: z.unknown().optional().describe("The whole metadata"),
};

/** The output of `procedure.define` */
const DefineOutputSchema = z.looseObject({
  path: z.array(z.string()).describe("The path of the defined procedure"),
  replaced: z.boolean().describe("True when the call replaced a runtime-defined procedure"),
}) as z.ZodType<DefineProcedureOutput>;

/**
 * The output of `procedure.get`: one object, so MCP clients get an object output schema. With
 * `found: false`, the other fields are absent.
 */
const GetOutputSchema = z.looseObject({
  found: z.boolean().describe("True when the registry has the procedure"),
  path: descriptionFields.path.optional(),
  key: descriptionFields.key.optional(),
  description: descriptionFields.description,
  tags: descriptionFields.tags,
  hasHandler: descriptionFields.hasHandler.optional(),
  runtime: descriptionFields.runtime.optional(),
  metadata: descriptionFields.metadata,
  hasInputSchema: z.boolean().optional().describe("True when the procedure has an input schema"),
  hasOutputSchema: z.boolean().optional().describe("True when the procedure has an output schema"),
  input: z.record(z.string(), z.unknown()).optional().describe("The JSON Schema of the input"),
  output: z.record(z.string(), z.unknown()).optional().describe("The JSON Schema of the output"),
  effects: z.unknown().optional().describe("The declared effects: reads, writes, idempotent, destructive"),
}) as z.ZodType<{ found: false } | (ProcedureDescription & GetSchemas & { found: true; hasInputSchema: boolean; hasOutputSchema: boolean })>;

/** The JSON Schemas and the effects that `procedure.get` gives (roadmap R17). */
interface GetSchemas {
  input?: JsonSchema | undefined;
  output?: JsonSchema | undefined;
  effects?: Effects | undefined;
}

/** The output of `procedure.manifest` */
const ManifestOutputSchema = z.looseObject({
  format: z.literal(MANIFEST_FORMAT).describe("The format of the manifest"),
  hash: z.string().describe("A hash of the entries: two manifests with the same hash describe the same procedures"),
  procedures: z.array(z.looseObject({ path: z.array(z.string()), key: z.string() })).describe("The procedures, in the order of their keys"),
}) as unknown as z.ZodType<ProcedureManifest>;

/** The output of `procedure.list` */
const ListOutputSchema = z.looseObject({
  procedures: z.array(z.looseObject(descriptionFields)).describe("The procedures, in the order of the registry"),
  count: z.number().describe("The number of procedures"),
}) as z.ZodType<{ procedures: ProcedureDescription[]; count: number }>;

/** The output of `procedure.delete` */
const DeleteOutputSchema = z.looseObject({
  deleted: z.boolean().describe("True when the registry removed the procedure"),
}) as z.ZodType<{ deleted: boolean }>;

// =============================================================================
// Aggregation Handler Factory
// =============================================================================

/**
 * Create a handler that executes an aggregation definition.
 *
 * The body runs exactly as `exec()` runs the same program: one run of the kernel (`runProgram()`),
 * whose root document is the root call (a `$when` on the root call does not apply, a list of calls
 * in the root input is an implicit chain). The scope of the
 * body has one name, `input`: the input of the procedure. So `{ $ref: "input.dir" }` reads a
 * field of the input, and `$last`, the step names, `item`, `acc` and `index` keep their meaning
 * inside the body. (Deep dive CORE-4: before, a first pass replaced every `$ref` with a field of
 * the input. Docs review DOC-3: before, the body hydrated its root call as a nested ref, so a
 * root `$when` applied and a list in the root input stayed a list.)
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
    const executor = <TIn, TOut>(path: ProcedurePath, value: TIn): Promise<TOut> => ctx.client.call<TIn, TOut>(path, value);
    const options = { scope, rawInput: rawInputRule(ctx.registry ?? PROCEDURE_REGISTRY), onRef: ctx.onRef };
    if (isAnyProcedureRef(aggregation)) {
      return runProgram(aggregation, { ...options, executor });
    }
    // A body that is not one call (an older stored program): hydrate it as a root value
    return hydrateInput(aggregation, executor, options);
  };
}

// =============================================================================
// Runtime-Defined Procedures
// =============================================================================

// The store of the programs of procedure.define (runtime-programs.ts, which imports nothing)
export { isRuntimeDefined } from "./runtime-programs.js";

/**
 * The program (the aggregation) of a procedure that `procedure.define` made, or undefined for a
 * code procedure. A program store saves it and defines it again after a restart (roadmap 3.2).
 */
export function runtimeProgramOf(procedure: { handler?: unknown }): AggregationDefinition | undefined {
  return runtimeProgramOfHandler(procedure.handler) as AggregationDefinition | undefined;
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
 * - With a server's `expose` rule, the path must be exposed: a caller cannot define or replace a
 *   hidden procedure (`NOT_EXPOSED`).
 * - Its input is raw (the `runs-refs` tag): `exec()` does not run the body at definition time.
 */
export const defineProcedureProcedure: Procedure<
  DefineProcedureInput,
  DefineProcedureOutput,
  DefineMetadata
> = defineProcedure({
  path: ["procedure", "define"],
  input: defineInputSchema as any,
  output: DefineOutputSchema,
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
    // A path outside the expose rule of the host is not the caller's to define or replace (R17)
    if (ctx?.expose && !ctx.expose(path)) {
      throw new InvocationError(
        "NOT_EXPOSED",
        `Procedure not exposed: ${pathKey}. procedure.define can define or replace only a procedure that this host exposes.`,
        ctx.path ?? ["procedure", "define"]
      );
    }
    const existing = registry.get(path);
    if (existing && !isRuntimeDefined(existing)) {
      throw new Error(
        `A code procedure exists at path: ${pathKey}. procedure.define can replace only a procedure that procedure.define made.`
      );
    }
    if (existing && !replace) {
      throw new Error(`Procedure already exists at path: ${pathKey}`);
    }

    // The effects of the body that the host found (roadmap R22). Only an interceptor of the host
    // can give them: each transport removes the key from a request.
    const inferred = effectsValue(ctx?.metadata?.[INFERRED_EFFECTS_METADATA_KEY]);

    // Create the procedure
    const procedure: AnyProcedure = defineProcedure({
      path,
      input: anySchema,
      output: anySchema,
      metadata: {
        ...(metadata ?? {
          description: `Runtime-defined aggregation procedure`,
          generatedFrom: "procedure.define",
          aggregation,
        }),
        // No effects of its own, as client.chain: the admission examines each nested call of a
        // data-driven procedure. The framework sets it, so the metadata of a caller cannot claim less
        effects: PURE_EFFECTS,
        // The framework sets this field too: the effects of the body, for the tool hints
        ...(inferred ? { inferredEffects: inferred } : { inferredEffects: undefined }),
      },
      handler: createAggregationHandler(aggregation),
    });

    // Its behavior comes from data: a server with an expose rule lets it call only exposed procedures
    markDataDriven(procedure);
    markRuntimeProgram(procedure.handler!, aggregation);

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

/** The description of one procedure, for `procedure.list` and `procedure.get`. */
export interface ProcedureDescription {
  /** The path of the procedure */
  path: ProcedurePath;
  /** The path as a dotted key */
  key: string;
  /** The description of the metadata */
  description: string | undefined;
  /** The tags of the metadata */
  tags: string[] | undefined;
  /** True when the procedure has a handler (it can run) */
  hasHandler: boolean;
  /** True for a procedure that `procedure.define` made */
  runtime: boolean;
  /** The whole metadata (`procedure.list` gives it with `includeMetadata`) */
  metadata?: ProcedureMetadata | undefined;
}

function describeProcedure(procedure: AnyProcedure, withMetadata: boolean): ProcedureDescription {
  const meta = procedure.metadata as ProcedureMetadata | undefined;
  const description: ProcedureDescription = {
    path: procedure.path,
    key: pathToKey(procedure.path),
    description: meta?.description,
    tags: meta?.tags,
    hasHandler: !!procedure.handler,
    runtime: isRuntimeDefined(procedure),
  };
  if (withMetadata) description.metadata = meta;
  return description;
}

/** The input of `procedure.list` */
export interface ProcedureListInput {
  namespace?: string | undefined;
  includeMetadata?: boolean | undefined;
  runtime?: boolean | undefined;
}

/** The input of `procedure.get` */
export interface ProcedureGetInput {
  path: string[] | string;
}

const listInputSchema: z.ZodType<ProcedureListInput> = z.object({
  /** Only the procedures under this first path segment */
  namespace: z.string().optional().describe("Only the procedures under this first path segment"),
  /** The whole metadata of each procedure */
  includeMetadata: z.boolean().optional().describe("Give the whole metadata of each procedure"),
  /** Only the procedures that procedure.define made */
  runtime: z.boolean().optional().describe("Only the procedures that procedure.define made"),
});

const getInputSchema: z.ZodType<ProcedureGetInput> = z.object({
  /** The path, as an array or a dotted key */
  path: z.union([z.array(z.string()), z.string()]).describe("The path, as an array or a dotted key"),
});

/**
 * Describe one procedure of the caller's registry.
 *
 * Docs review DOC-6: the core version gave only runtime-defined procedures, and client-procedure
 * replaced it with a version for the whole registry, so the result depended on the imports of
 * the host. This is the one implementation: any procedure, with `runtime` for a defined one (its
 * metadata holds the aggregation).
 */
export const getProcedureProcedure: Procedure<
  ProcedureGetInput,
  { found: false } | (ProcedureDescription & GetSchemas & { found: true; hasInputSchema: boolean; hasOutputSchema: boolean }),
  ProcedureMetadata
> = defineProcedure({
  path: ["procedure", "get"],
  input: zodAdapter(getInputSchema),
  output: GetOutputSchema,
  metadata: {
    description: "Describe a procedure by path or key",
    tags: ["core", "meta"],
    args: ["path"],
    output: "json",
  },
  handler: async (input: ProcedureGetInput, ctx?: ProcedureContext) => {
    const path = typeof input.path === "string" ? keyToPath(input.path) : input.path;
    const procedure = (ctx?.registry ?? PROCEDURE_REGISTRY).get(path);
    // A procedure outside the expose rule of the host is not found (R17)
    if (!procedure || (ctx?.expose && !ctx.expose(procedure.path))) {
      return { found: false as const };
    }
    const entry = describeEntry(procedure);
    return {
      found: true as const,
      ...describeProcedure(procedure, true),
      hasInputSchema: !!procedure.input,
      hasOutputSchema: !!procedure.output,
      // The JSON Schemas and the effects of the one manifest type (R17)
      ...(entry.input ? { input: entry.input } : {}),
      ...(entry.output ? { output: entry.output } : {}),
      ...(entry.effects ? { effects: entry.effects } : {}),
    };
  },
});

/**
 * List the procedures of the caller's registry: all of them, the procedures under a namespace,
 * or (`runtime: true`) only the procedures that `procedure.define` made. See `getProcedureProcedure`
 * for DOC-6.
 */
export const listProceduresProcedure: Procedure<
  ProcedureListInput,
  { procedures: ProcedureDescription[]; count: number },
  ProcedureMetadata
> = defineProcedure({
  path: ["procedure", "list"],
  input: zodAdapter(listInputSchema),
  output: ListOutputSchema,
  metadata: {
    description: "List the registered procedures",
    tags: ["core", "meta"],
    args: [],
    shorts: { namespace: "n", includeMetadata: "m" },
    output: "json",
  },
  handler: async (input: ProcedureListInput, ctx?: ProcedureContext) => {
    let all = (ctx?.registry ?? PROCEDURE_REGISTRY).getAll();
    // Only the procedures that the host exposes (R17)
    if (ctx?.expose) all = all.filter((procedure) => ctx.expose!(procedure.path));
    if (input.runtime) all = all.filter(isRuntimeDefined);
    if (input.namespace) all = all.filter((procedure) => procedure.path[0] === input.namespace);
    const procedures = all.map((procedure) => describeProcedure(procedure, input.includeMetadata ?? false));
    return { procedures, count: procedures.length };
  },
});

/**
 * The manifest of the caller's registry (roadmap R17): each procedure that the host exposes, with
 * its JSON Schemas, effects and command-line metadata, and a hash. The compiler and the SDK
 * generators read it.
 */
export const manifestProcedure: Procedure<{ namespace?: string | undefined }, ProcedureManifest, ProcedureMetadata> = defineProcedure({
  path: ["procedure", "manifest"],
  input: zodAdapter(
    z.object({ namespace: z.string().optional().describe("Only the procedures under this first path segment") }) as z.ZodType<{ namespace?: string | undefined }>,
  ),
  output: ManifestOutputSchema,
  metadata: {
    description: "The manifest of the registry: each exposed procedure with its schemas and effects",
    tags: ["core", "meta"],
    args: [],
    shorts: { namespace: "n" },
    output: "json",
  },
  handler: async (input: { namespace?: string | undefined }, ctx?: ProcedureContext) =>
    describeRegistry(ctx?.registry ?? PROCEDURE_REGISTRY, {
      ...(ctx?.expose ? { expose: ctx.expose } : {}),
      ...(input.namespace ? { include: (procedure: AnyProcedure) => procedure.path[0] === input.namespace } : {}),
    }),
});

/**
 * Delete a runtime-defined procedure. A procedure outside the expose rule of the host is not
 * found (R17), so a caller cannot delete a hidden procedure.
 */
export const deleteProcedureProcedure: Procedure<
  { path: ProcedurePath },
  { deleted: boolean },
  ProcedureMetadata
> = defineProcedure({
  path: ["procedure", "delete"],
  input: deleteInputSchema as any,
  output: DeleteOutputSchema,
  metadata: {
    description: "Delete a runtime-defined procedure",
    tags: ["core", "meta"],
  },
  handler: async (input: { path: ProcedurePath }, ctx?: ProcedureContext): Promise<{ deleted: boolean }> => {
    const registry = ctx?.registry ?? PROCEDURE_REGISTRY;
    // A procedure outside the expose rule of the host is not found (R17)
    if (ctx?.expose && !ctx.expose(input.path)) {
      return { deleted: false };
    }
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
  // They read the registry. define and delete change it (CAPABILITIES-2026-10).
  ...withEffects({ reads: ["registry"], writes: ["registry"] }, [defineProcedureProcedure as AnyProcedure]),
  ...withEffects(REGISTRY_READ_EFFECTS, [
    getProcedureProcedure as AnyProcedure,
    listProceduresProcedure as AnyProcedure,
    manifestProcedure as AnyProcedure,
  ]),
  ...withEffects({ reads: ["registry"], writes: ["registry"] }, [deleteProcedureProcedure as AnyProcedure]),
];
