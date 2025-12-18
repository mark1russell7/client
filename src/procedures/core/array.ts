/**
 * Array Procedures
 *
 * Array manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.first, client.filter).
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
// First Procedure
// =============================================================================

interface FirstInput {
  items: unknown[];
}

type FirstProcedure = Procedure<FirstInput, unknown, { description: string; tags: string[] }>;

const firstProcedure: FirstProcedure = defineProcedure({
  path: ["first"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Get first element of array",
    tags: ["core", "array"],
  },
  handler: async (input: FirstInput): Promise<unknown> => {
    return input.items[0];
  },
});

// =============================================================================
// Last Procedure
// =============================================================================

interface LastInput {
  items: unknown[];
}

type LastProcedure = Procedure<LastInput, unknown, { description: string; tags: string[] }>;

const lastProcedure: LastProcedure = defineProcedure({
  path: ["last"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Get last element of array",
    tags: ["core", "array"],
  },
  handler: async (input: LastInput): Promise<unknown> => {
    return input.items[input.items.length - 1];
  },
});

// =============================================================================
// Nth Procedure
// =============================================================================

interface NthInput {
  items: unknown[];
  index: number;
}

type NthProcedure = Procedure<NthInput, unknown, { description: string; tags: string[] }>;

const nthProcedure: NthProcedure = defineProcedure({
  path: ["nth"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Get element at index (supports negative indexing)",
    tags: ["core", "array"],
  },
  handler: async (input: NthInput): Promise<unknown> => {
    const index = input.index < 0 ? input.items.length + input.index : input.index;
    return input.items[index];
  },
});

// =============================================================================
// ArrLength Procedure
// =============================================================================

interface ArrLengthInput {
  items: unknown[];
}

type ArrLengthProcedure = Procedure<ArrLengthInput, number, { description: string; tags: string[] }>;

const arrLengthProcedure: ArrLengthProcedure = defineProcedure({
  path: ["arrLength"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Get array length",
    tags: ["core", "array"],
  },
  handler: async (input: ArrLengthInput): Promise<number> => {
    return input.items.length;
  },
});

// =============================================================================
// Flatten Procedure
// =============================================================================

interface FlattenInput {
  items: unknown[];
  depth?: number;
}

type FlattenProcedure = Procedure<FlattenInput, unknown[], { description: string; tags: string[] }>;

const flattenProcedure: FlattenProcedure = defineProcedure({
  path: ["flatten"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Flatten nested arrays to specified depth",
    tags: ["core", "array"],
  },
  handler: async (input: FlattenInput): Promise<unknown[]> => {
    return (input.items as unknown[]).flat(input.depth ?? 1);
  },
});

// =============================================================================
// Reverse Procedure
// =============================================================================

interface ReverseInput {
  items: unknown[];
}

type ReverseProcedure = Procedure<ReverseInput, unknown[], { description: string; tags: string[] }>;

const reverseProcedure: ReverseProcedure = defineProcedure({
  path: ["reverse"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Reverse array order",
    tags: ["core", "array"],
  },
  handler: async (input: ReverseInput): Promise<unknown[]> => {
    return [...input.items].reverse();
  },
});

// =============================================================================
// Sort Procedure
// =============================================================================

interface SortInput {
  items: unknown[];
  key?: string;
  desc?: boolean;
}

type SortProcedure = Procedure<SortInput, unknown[], { description: string; tags: string[] }>;

const sortProcedure: SortProcedure = defineProcedure({
  path: ["sort"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Sort array (optionally by key, optionally descending)",
    tags: ["core", "array"],
  },
  handler: async (input: SortInput): Promise<unknown[]> => {
    const items = [...input.items];
    const direction = input.desc ? -1 : 1;

    return items.sort((a, b) => {
      let aVal = input.key ? (a as Record<string, unknown>)[input.key] : a;
      let bVal = input.key ? (b as Record<string, unknown>)[input.key] : b;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal) * direction;
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return (aVal - bVal) * direction;
      }
      return 0;
    });
  },
});

// =============================================================================
// Slice Procedure
// =============================================================================

interface SliceInput {
  items: unknown[];
  start: number;
  end?: number;
}

type SliceProcedure = Procedure<SliceInput, unknown[], { description: string; tags: string[] }>;

const sliceProcedure: SliceProcedure = defineProcedure({
  path: ["slice"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Extract portion of array",
    tags: ["core", "array"],
  },
  handler: async (input: SliceInput): Promise<unknown[]> => {
    return input.items.slice(input.start, input.end);
  },
});

// =============================================================================
// ArrConcat Procedure
// =============================================================================

interface ArrConcatInput {
  arrays: unknown[][];
}

type ArrConcatProcedure = Procedure<ArrConcatInput, unknown[], { description: string; tags: string[] }>;

const arrConcatProcedure: ArrConcatProcedure = defineProcedure({
  path: ["arrConcat"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Concatenate multiple arrays",
    tags: ["core", "array"],
  },
  handler: async (input: ArrConcatInput): Promise<unknown[]> => {
    return ([] as unknown[]).concat(...input.arrays);
  },
});

// =============================================================================
// Unique Procedure
// =============================================================================

interface UniqueInput {
  items: unknown[];
  key?: string;
}

type UniqueProcedure = Procedure<UniqueInput, unknown[], { description: string; tags: string[] }>;

const uniqueProcedure: UniqueProcedure = defineProcedure({
  path: ["unique"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Remove duplicate values (optionally by key)",
    tags: ["core", "array"],
  },
  handler: async (input: UniqueInput): Promise<unknown[]> => {
    if (input.key) {
      const seen = new Set<unknown>();
      return input.items.filter((item) => {
        const val = (item as Record<string, unknown>)[input.key!];
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
      });
    }
    return [...new Set(input.items)];
  },
});

// =============================================================================
// GroupBy Procedure
// =============================================================================

interface GroupByInput {
  items: unknown[];
  key: string;
}

type GroupByProcedure = Procedure<GroupByInput, Record<string, unknown[]>, { description: string; tags: string[] }>;

const groupByProcedure: GroupByProcedure = defineProcedure({
  path: ["groupBy"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Group array items by key value",
    tags: ["core", "array"],
  },
  handler: async (input: GroupByInput): Promise<Record<string, unknown[]>> => {
    const result: Record<string, unknown[]> = {};
    for (const item of input.items) {
      const keyVal = String((item as Record<string, unknown>)[input.key]);
      if (!result[keyVal]) {
        result[keyVal] = [];
      }
      result[keyVal].push(item);
    }
    return result;
  },
});

// =============================================================================
// Zip Procedure
// =============================================================================

interface ZipInput {
  arrays: unknown[][];
}

type ZipProcedure = Procedure<ZipInput, unknown[][], { description: string; tags: string[] }>;

const zipProcedure: ZipProcedure = defineProcedure({
  path: ["zip"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Zip multiple arrays into array of tuples",
    tags: ["core", "array"],
  },
  handler: async (input: ZipInput): Promise<unknown[][]> => {
    if (input.arrays.length === 0) return [];
    const maxLen = Math.max(...input.arrays.map((a) => a.length));
    const result: unknown[][] = [];
    for (let i = 0; i < maxLen; i++) {
      result.push(input.arrays.map((a) => a[i]));
    }
    return result;
  },
});

// =============================================================================
// Unzip Procedure
// =============================================================================

interface UnzipInput {
  tuples: unknown[][];
}

type UnzipProcedure = Procedure<UnzipInput, unknown[][], { description: string; tags: string[] }>;

const unzipProcedure: UnzipProcedure = defineProcedure({
  path: ["unzip"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Unzip array of tuples into multiple arrays",
    tags: ["core", "array"],
  },
  handler: async (input: UnzipInput): Promise<unknown[][]> => {
    if (input.tuples.length === 0) return [];
    const numArrays = input.tuples[0]?.length ?? 0;
    const result: unknown[][] = Array.from({ length: numArrays }, () => []);
    for (const tuple of input.tuples) {
      for (let i = 0; i < numArrays; i++) {
        result[i]!.push(tuple[i]);
      }
    }
    return result;
  },
});

// =============================================================================
// IndexOf Procedure
// =============================================================================

interface IndexOfInput {
  items: unknown[];
  value: unknown;
  fromIndex?: number;
}

type IndexOfProcedure = Procedure<IndexOfInput, number, { description: string; tags: string[] }>;

const indexOfProcedure: IndexOfProcedure = defineProcedure({
  path: ["indexOf"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Find index of value in array (-1 if not found)",
    tags: ["core", "array"],
  },
  handler: async (input: IndexOfInput): Promise<number> => {
    return input.items.indexOf(input.value, input.fromIndex);
  },
});

// =============================================================================
// Contains Procedure
// =============================================================================

interface ContainsInput {
  items: unknown[];
  value: unknown;
}

type ContainsProcedure = Procedure<ContainsInput, boolean, { description: string; tags: string[] }>;

const containsProcedure: ContainsProcedure = defineProcedure({
  path: ["contains"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Check if array contains value",
    tags: ["core", "array"],
  },
  handler: async (input: ContainsInput): Promise<boolean> => {
    return input.items.includes(input.value);
  },
});

// =============================================================================
// Push Procedure (Immutable)
// =============================================================================

interface PushInput {
  items: unknown[];
  value: unknown;
}

type PushProcedure = Procedure<PushInput, unknown[], { description: string; tags: string[] }>;

const pushProcedure: PushProcedure = defineProcedure({
  path: ["push"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Add value to end of array (immutable)",
    tags: ["core", "array"],
  },
  handler: async (input: PushInput): Promise<unknown[]> => {
    return [...input.items, input.value];
  },
});

// =============================================================================
// Unshift Procedure (Immutable)
// =============================================================================

interface UnshiftInput {
  items: unknown[];
  value: unknown;
}

type UnshiftProcedure = Procedure<UnshiftInput, unknown[], { description: string; tags: string[] }>;

const unshiftProcedure: UnshiftProcedure = defineProcedure({
  path: ["unshift"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Add value to beginning of array (immutable)",
    tags: ["core", "array"],
  },
  handler: async (input: UnshiftInput): Promise<unknown[]> => {
    return [input.value, ...input.items];
  },
});

// =============================================================================
// Range Procedure
// =============================================================================

interface RangeInput {
  start: number;
  end: number;
  step?: number;
}

type RangeProcedure = Procedure<RangeInput, number[], { description: string; tags: string[] }>;

const rangeProcedure: RangeProcedure = defineProcedure({
  path: ["range"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Generate array of numbers from start to end (exclusive)",
    tags: ["core", "array"],
  },
  handler: async (input: RangeInput): Promise<number[]> => {
    const step = input.step ?? 1;
    const result: number[] = [];
    if (step > 0) {
      for (let i = input.start; i < input.end; i += step) {
        result.push(i);
      }
    } else if (step < 0) {
      for (let i = input.start; i > input.end; i += step) {
        result.push(i);
      }
    }
    return result;
  },
});

// =============================================================================
// Export Array Procedures
// =============================================================================

/**
 * All array procedures (before namespacing).
 */
const arrayProceduresRaw: AnyProcedure[] = [
  firstProcedure as AnyProcedure,
  lastProcedure as AnyProcedure,
  nthProcedure as AnyProcedure,
  arrLengthProcedure as AnyProcedure,
  flattenProcedure as AnyProcedure,
  reverseProcedure as AnyProcedure,
  sortProcedure as AnyProcedure,
  sliceProcedure as AnyProcedure,
  arrConcatProcedure as AnyProcedure,
  uniqueProcedure as AnyProcedure,
  groupByProcedure as AnyProcedure,
  zipProcedure as AnyProcedure,
  unzipProcedure as AnyProcedure,
  indexOfProcedure as AnyProcedure,
  containsProcedure as AnyProcedure,
  pushProcedure as AnyProcedure,
  unshiftProcedure as AnyProcedure,
  rangeProcedure as AnyProcedure,
];

/**
 * All array procedures namespaced under "client".
 */
export const arrayProcedures: AnyProcedure[] = namespace(["client"], arrayProceduresRaw);

/**
 * Array procedures module for registration.
 */
export const arrayModule: { name: string; procedures: AnyProcedure[] } = {
  name: "client-array",
  procedures: arrayProcedures,
};

// Re-export individual procedures for direct access
export {
  firstProcedure,
  lastProcedure,
  nthProcedure,
  arrLengthProcedure,
  flattenProcedure,
  reverseProcedure,
  sortProcedure,
  sliceProcedure,
  arrConcatProcedure,
  uniqueProcedure,
  groupByProcedure,
  zipProcedure,
  unzipProcedure,
  indexOfProcedure,
  containsProcedure,
  pushProcedure,
  unshiftProcedure,
  rangeProcedure,
};
