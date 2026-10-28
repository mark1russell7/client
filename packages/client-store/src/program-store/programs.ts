/**
 * The procedures of the saved programs of a tenant (AG1-B): `programs.save`, `get`, `list` and
 * `remove`.
 *
 * One program store has two scopes:
 *
 * - The scope "host": the store of a registry (`attachProgramStore`). `procedure.store`, `load` and
 *   `sync` use it, and `procedure.load` defines its programs in the registry.
 * - The scope "tenant": the store of a partition. The procedures of this module read and write it.
 *   They do not define a program in a registry. A program of a tenant is data: a view lists it,
 *   and a caller starts it with `client.chain` or `client.exec`.
 *
 * The partition of each call comes from the resolver of the host, as for `createCollectionProcedures`.
 * The resolver gets the context (with `ctx.principal`) and the partition that the input asks for.
 * The input only selects: the resolver decides. A `null` result refuses the call (`FORBIDDEN`,
 * reason `partition-not-allowed`). The function `storeFor` gives the store of the partition.
 * Thus one tenant does not read the store of another tenant.
 *
 * A save tests the record with `checkStoredProgram`, and the program with the test of
 * `procedure.define` (`isAnyProcedureRef`). A save and a remove take `expectedVersion` (decision
 * D11): a conflict rejects with `VersionConflictError` and changes nothing.
 */

import { z } from "zod";
import {
  createProcedure,
  defineModule,
  InvocationError,
  isAnyProcedureRef,
  pathToKey,
  PARTITION_PATTERN,
  RAW_INPUT_TAG,
  typed,
  type AggregationDefinition,
  type AnyProcedure,
  type PartitionResolver,
  type ProcedureContext,
  type ProcedureModule,
  type ProcedurePath,
} from "@procedures/client";
import { pathField, toPath } from "./procedures.js";
import { checkStoredProgram, type ProgramStore, type ProgramWriteOptions, type StoredProgram } from "./types.js";

/** The options of `createProgramProcedures`. */
export interface ProgramProceduresOptions {
  /**
   * The resolver of the partition of a call: the tenant comes from the principal, not from the
   * input alone. It gives the partition, `undefined` for the store without a partition, or `null`
   * to refuse the call.
   */
  readonly partition: PartitionResolver;
  /**
   * The store of a partition. Give the same store for the same partition each time, and a store of
   * its own for each tenant.
   */
  readonly storeFor: (partition: string | undefined) => ProgramStore | Promise<ProgramStore>;
  /**
   * The namespace of the procedures.
   * @default ["programs"]
   */
  readonly namespace?: ProcedurePath | undefined;
}

/** The input of `programs.save`. */
export interface ProgramSaveInput {
  path: ProcedurePath | string;
  program: AggregationDefinition;
  name?: string | undefined;
  description?: string | undefined;
  expectedVersion?: string | number | null | undefined;
  partition?: string | undefined;
}

/** The input of `programs.get`: a path or a key. */
export interface ProgramGetInput {
  path?: ProcedurePath | string | undefined;
  key?: string | undefined;
  partition?: string | undefined;
}

/** The input of `programs.list`. */
export interface ProgramListInput {
  prefix?: ProcedurePath | string | undefined;
  partition?: string | undefined;
}

/** The input of `programs.remove`. */
export interface ProgramRemoveInput {
  path: ProcedurePath | string;
  expectedVersion?: string | number | null | undefined;
  partition?: string | undefined;
}

/** The output of `programs.remove`. */
export interface ProgramRemoveOutput {
  /** True when the store had the program. */
  removed: boolean;
  /** The key of the program. */
  key: string;
}

/** The resource of the effects of the procedures. */
const PROGRAMS = "programs";

const partitionField = z
  .string()
  .regex(PARTITION_PATTERN)
  .optional()
  .describe("The partition that the call asks for, for example a scope. The resolver of the host decides.");

const expectedVersionField = z
  .union([z.string().max(1024), z.number(), z.null()])
  .optional()
  .describe("The version that the write expects for the current program. null expects no program. Absent: the last write wins.");

/** The schema of a program, as `procedure.define` takes it. */
const programField = z
  .looseObject({
    $proc: z.array(z.string().min(1)).min(1).describe("The path of the procedure that the program calls"),
    input: z.unknown().optional().describe("The input of that call"),
    $name: z.string().optional().describe("A name that a $ref can read"),
  })
  .describe('The program: a procedure ref, for example { "$proc": ["client", "chain"], "input": { "steps": [...] } }');

/** The options of a write: only a given `expectedVersion`, so a store without versions gets no field. */
function writeOptionsOf(expectedVersion: string | number | null | undefined): ProgramWriteOptions | undefined {
  return expectedVersion === undefined ? undefined : { expectedVersion };
}

/**
 * This function gives the procedures of the saved programs of a tenant: `save`, `get`, `list` and
 * `remove` under the namespace. Each call resolves its partition, and reads and writes only the
 * store of that partition. The function registers nothing.
 *
 * @example
 * ```typescript
 * const stores = new Map<string, ProgramStore>();
 * const procedures = createProgramProcedures({
 *   // The tenant comes from the principal. A call without a principal is refused.
 *   partition: (ctx) => ctx.principal?.id ?? null,
 *   storeFor: (tenant) => {
 *     const key = tenant ?? "";
 *     if (!stores.has(key)) stores.set(key, new MemoryProgramStore());
 *     return stores.get(key)!;
 *   },
 * });
 * ```
 */
export function createProgramProcedures(options: ProgramProceduresOptions): AnyProcedure[] {
  const namespace: ProcedurePath = [...(options.namespace ?? [PROGRAMS])];
  if (namespace.length === 0 || !namespace.every((segment) => typeof segment === "string" && segment !== "")) {
    throw new TypeError("The namespace of the program procedures must be a list of non-empty strings");
  }
  const what = pathToKey(namespace);

  /** The store of a call: the resolver gives the partition, and `storeFor` its store. */
  const storeOf = async (ctx: ProcedureContext, requested: string | undefined): Promise<ProgramStore> => {
    const partition = await options.partition(ctx, requested);
    if (partition === null) {
      const of = requested === undefined ? "" : ` "${requested}"`;
      throw new InvocationError("FORBIDDEN", `The call cannot use the partition${of} of ${what}`, ctx.path, "partition-not-allowed");
    }
    if (partition !== undefined && !PARTITION_PATTERN.test(partition)) {
      throw new Error(`The partition resolver gave a partition that is not valid: ${JSON.stringify(partition).slice(0, 80)}`);
    }
    return options.storeFor(partition);
  };

  const notFound = (ctx: ProcedureContext, key: string): InvocationError =>
    new InvocationError("NOT_FOUND", `No program is saved at ${key}`, ctx.path);

  const save: AnyProcedure = createProcedure()
    .path([...namespace, "save"])
    .input(
      z.object({
        path: pathField,
        program: programField,
        name: z.string().min(1).max(200).optional().describe("The name of the program, for a list of programs"),
        description: z.string().max(2000).optional().describe("The description of the program, in words"),
        expectedVersion: expectedVersionField,
        partition: partitionField,
      })
    )
    .output(typed<StoredProgram>())
    .meta({
      description: "Save a program of the caller's partition: a new program, or a new version of a saved one",
      // The program is data: exec() does not run its refs
      tags: ["programs", "storage", RAW_INPUT_TAG],
      // It replaces the saved program of the same path
      effects: { reads: [PROGRAMS], writes: [PROGRAMS] },
      args: ["path"],
    })
    .handler(async (input: ProgramSaveInput, ctx: ProcedureContext): Promise<StoredProgram> => {
      const path = toPath(input.path);
      if (!isAnyProcedureRef(input.program)) {
        throw new InvocationError("VALIDATION_ERROR", 'The program must be a procedure ref: { "$proc": [...], "input": {...} }', ctx.path);
      }
      const record = checkStoredProgram({
        key: pathToKey(path),
        path: [...path],
        program: input.program,
        storedAt: Date.now(),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
      });
      const store = await storeOf(ctx, input.partition);
      await store.put(record, writeOptionsOf(input.expectedVersion));
      // The store sets the version: the record of the store is the result
      return (await store.get(record.key)) ?? record;
    })
    .build();

  const get: AnyProcedure = createProcedure()
    .path([...namespace, "get"])
    .input(
      z.object({
        path: pathField.optional(),
        key: z.string().min(1).optional().describe('The dotted key of the program, for example "reports.weekly"'),
        partition: partitionField,
      })
    )
    .output(typed<StoredProgram>())
    .meta({
      description: "Read a saved program of the caller's partition, with its version",
      tags: ["programs", "storage"],
      effects: { reads: [PROGRAMS], writes: [], idempotent: true },
    })
    .handler(async (input: ProgramGetInput, ctx: ProcedureContext): Promise<StoredProgram> => {
      if ((input.path === undefined) === (input.key === undefined)) {
        throw new InvocationError("VALIDATION_ERROR", `${what}.get needs exactly one of \`path\` or \`key\``, ctx.path);
      }
      const key = input.key ?? pathToKey(toPath(input.path!));
      const store = await storeOf(ctx, input.partition);
      const program = await store.get(key);
      if (!program) throw notFound(ctx, key);
      return program;
    })
    .build();

  const list: AnyProcedure = createProcedure()
    .path([...namespace, "list"])
    .input(
      z.object({
        prefix: pathField.optional().describe("Only the programs of this path and under it"),
        partition: partitionField,
      })
    )
    .output(typed<StoredProgram[]>())
    .meta({
      description: "List the saved programs of the caller's partition, sorted by key",
      tags: ["programs", "storage"],
      effects: { reads: [PROGRAMS], writes: [], idempotent: true },
    })
    .handler(async (input: ProgramListInput, ctx: ProcedureContext): Promise<StoredProgram[]> => {
      const store = await storeOf(ctx, input.partition);
      return store.list(input.prefix === undefined ? undefined : pathToKey(toPath(input.prefix)));
    })
    .build();

  const remove: AnyProcedure = createProcedure()
    .path([...namespace, "remove"])
    .input(
      z.object({
        path: pathField,
        expectedVersion: expectedVersionField,
        partition: partitionField,
      })
    )
    .output(
      z.object({
        removed: z.boolean().describe("True when the store had the program"),
        key: z.string().describe("The key of the program"),
      })
    )
    .meta({
      description: "Remove a saved program of the caller's partition",
      tags: ["programs", "storage"],
      effects: { reads: [PROGRAMS], writes: [PROGRAMS], destructive: true, idempotent: true },
      args: ["path"],
    })
    .handler(async (input: ProgramRemoveInput, ctx: ProcedureContext): Promise<ProgramRemoveOutput> => {
      const key = pathToKey(toPath(input.path));
      const store = await storeOf(ctx, input.partition);
      return { removed: await store.delete(key, writeOptionsOf(input.expectedVersion)), key };
    })
    .build();

  return [save, get, list, remove];
}

/**
 * This function gives the procedures of `createProgramProcedures` as a module, for
 * `createRegistry()` or `registerModules()`. The name of the module has the namespace, so two
 * namespaces give two modules. The function registers nothing.
 */
export function createProgramModule(options: ProgramProceduresOptions): ProcedureModule {
  const namespace = options.namespace ?? [PROGRAMS];
  return defineModule(`@procedures/store/programs:${namespace.join(".")}`, createProgramProcedures(options));
}
