/**
 * Object Procedures
 *
 * Object manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.get, client.set).
 */

import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure } from "../types.js";

// =============================================================================
// Type-safe passthrough schema
// =============================================================================

const anySchema: {
  parse: (data: unknown) => unknown;
  safeParse: (data: unknown) => { success: true; data: unknown };
  _output: unknown;
} = {
  parse: (data: unknown) => data,
  safeParse: (data: unknown) => ({ success: true as const, data }),
  _output: undefined as unknown,
};

// =============================================================================
// Helper: Get nested value by path
// =============================================================================

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// =============================================================================
// Helper: Set nested value by path
// =============================================================================

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const result = { ...obj };
  const parts = path.split(".");
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    } else {
      current[part] = { ...(current[part] as Record<string, unknown>) };
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart !== undefined) {
    current[lastPart] = value;
  }
  return result;
}

// =============================================================================
// Get Procedure
// =============================================================================

interface GetInput {
  object: Record<string, unknown>;
  path: string;
  default?: unknown;
}

type GetProcedure = Procedure<GetInput, unknown, { description: string; tags: string[] }>;

const getProcedure: GetProcedure = defineProcedure({
  path: ["get"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Get nested value from object by dot-separated path",
    tags: ["core", "object"],
  },
  handler: async (input: GetInput): Promise<unknown> => {
    const value = getByPath(input.object, input.path);
    return value !== undefined ? value : input.default;
  },
});

// =============================================================================
// Set Procedure
// =============================================================================

interface SetInput {
  object: Record<string, unknown>;
  path: string;
  value: unknown;
}

type SetProcedure = Procedure<SetInput, Record<string, unknown>, { description: string; tags: string[] }>;

const setProcedure: SetProcedure = defineProcedure({
  path: ["set"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Set nested value in object by dot-separated path (immutable)",
    tags: ["core", "object"],
  },
  handler: async (input: SetInput): Promise<Record<string, unknown>> => {
    return setByPath(input.object, input.path, input.value);
  },
});

// =============================================================================
// Merge Procedure
// =============================================================================

interface MergeInput {
  objects: Record<string, unknown>[];
  deep?: boolean;
}

type MergeProcedure = Procedure<MergeInput, Record<string, unknown>, { description: string; tags: string[] }>;

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === "object" &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

const mergeProcedure: MergeProcedure = defineProcedure({
  path: ["merge"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Merge multiple objects (shallow or deep)",
    tags: ["core", "object"],
  },
  handler: async (input: MergeInput): Promise<Record<string, unknown>> => {
    if (input.deep) {
      return input.objects.reduce((acc, obj) => deepMerge(acc, obj), {});
    }
    return Object.assign({}, ...input.objects);
  },
});

// =============================================================================
// Keys Procedure
// =============================================================================

interface KeysInput {
  object: Record<string, unknown>;
}

type KeysProcedure = Procedure<KeysInput, string[], { description: string; tags: string[] }>;

const keysProcedure: KeysProcedure = defineProcedure({
  path: ["keys"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Get array of object keys",
    tags: ["core", "object"],
  },
  handler: async (input: KeysInput): Promise<string[]> => {
    return Object.keys(input.object);
  },
});

// =============================================================================
// Values Procedure
// =============================================================================

interface ValuesInput {
  object: Record<string, unknown>;
}

type ValuesProcedure = Procedure<ValuesInput, unknown[], { description: string; tags: string[] }>;

const valuesProcedure: ValuesProcedure = defineProcedure({
  path: ["values"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Get array of object values",
    tags: ["core", "object"],
  },
  handler: async (input: ValuesInput): Promise<unknown[]> => {
    return Object.values(input.object);
  },
});

// =============================================================================
// Entries Procedure
// =============================================================================

interface EntriesInput {
  object: Record<string, unknown>;
}

type EntriesOutput = Array<[string, unknown]>;

type EntriesProcedure = Procedure<EntriesInput, EntriesOutput, { description: string; tags: string[] }>;

const entriesProcedure: EntriesProcedure = defineProcedure({
  path: ["entries"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Get array of [key, value] pairs",
    tags: ["core", "object"],
  },
  handler: async (input: EntriesInput): Promise<EntriesOutput> => {
    return Object.entries(input.object);
  },
});

// =============================================================================
// FromEntries Procedure
// =============================================================================

interface FromEntriesInput {
  entries: Array<[string, unknown]>;
}

type FromEntriesProcedure = Procedure<FromEntriesInput, Record<string, unknown>, { description: string; tags: string[] }>;

const fromEntriesProcedure: FromEntriesProcedure = defineProcedure({
  path: ["fromEntries"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Create object from [key, value] pairs",
    tags: ["core", "object"],
  },
  handler: async (input: FromEntriesInput): Promise<Record<string, unknown>> => {
    return Object.fromEntries(input.entries);
  },
});

// =============================================================================
// Pick Procedure
// =============================================================================

interface PickInput {
  object: Record<string, unknown>;
  keys: string[];
}

type PickProcedure = Procedure<PickInput, Record<string, unknown>, { description: string; tags: string[] }>;

const pickProcedure: PickProcedure = defineProcedure({
  path: ["pick"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Pick specified keys from object",
    tags: ["core", "object"],
  },
  handler: async (input: PickInput): Promise<Record<string, unknown>> => {
    const result: Record<string, unknown> = {};
    for (const key of input.keys) {
      if (key in input.object) {
        result[key] = input.object[key];
      }
    }
    return result;
  },
});

// =============================================================================
// Omit Procedure
// =============================================================================

interface OmitInput {
  object: Record<string, unknown>;
  keys: string[];
}

type OmitProcedure = Procedure<OmitInput, Record<string, unknown>, { description: string; tags: string[] }>;

const omitProcedure: OmitProcedure = defineProcedure({
  path: ["omit"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Omit specified keys from object",
    tags: ["core", "object"],
  },
  handler: async (input: OmitInput): Promise<Record<string, unknown>> => {
    const keysToOmit = new Set(input.keys);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(input.object)) {
      if (!keysToOmit.has(key)) {
        result[key] = input.object[key];
      }
    }
    return result;
  },
});

// =============================================================================
// Has Procedure
// =============================================================================

interface HasInput {
  object: Record<string, unknown>;
  path: string;
}

type HasProcedure = Procedure<HasInput, boolean, { description: string; tags: string[] }>;

const hasProcedure: HasProcedure = defineProcedure({
  path: ["has"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Check if object has a value at the specified path",
    tags: ["core", "object"],
  },
  handler: async (input: HasInput): Promise<boolean> => {
    return getByPath(input.object, input.path) !== undefined;
  },
});

// =============================================================================
// Export Object Procedures
// =============================================================================

/**
 * All object procedures (before namespacing).
 */
const objectProceduresRaw: AnyProcedure[] = [
  getProcedure as AnyProcedure,
  setProcedure as AnyProcedure,
  mergeProcedure as AnyProcedure,
  keysProcedure as AnyProcedure,
  valuesProcedure as AnyProcedure,
  entriesProcedure as AnyProcedure,
  fromEntriesProcedure as AnyProcedure,
  pickProcedure as AnyProcedure,
  omitProcedure as AnyProcedure,
  hasProcedure as AnyProcedure,
];

/**
 * All object procedures namespaced under "client".
 */
export const objectProcedures: AnyProcedure[] = namespace(["client"], objectProceduresRaw);

/**
 * Object procedures module for registration.
 */
export const objectModule: { name: string; procedures: AnyProcedure[] } = {
  name: "client-object",
  procedures: objectProcedures,
};

// Re-export individual procedures for direct access
export {
  getProcedure,
  setProcedure,
  mergeProcedure,
  keysProcedure,
  valuesProcedure,
  entriesProcedure,
  fromEntriesProcedure,
  pickProcedure,
  omitProcedure,
  hasProcedure,
};
