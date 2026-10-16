/**
 * Array Procedures
 *
 * Array manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.first, client.filter).
 */

import { z } from "zod";
import { anyOutput, arrayOutput, booleanOutput, numberOutput } from "./outputs.js";
import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure } from "../types.js";
import { PURE_EFFECTS, withEffects } from "../effects.js";

// =============================================================================
// First Procedure
// =============================================================================

interface FirstInput {
  items: unknown[];
}

const FirstInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
});

type FirstProcedure = Procedure<FirstInput, unknown, { description: string; tags: string[] }>;

const firstProcedure: FirstProcedure = defineProcedure({
  path: ["first"],
  input: FirstInputSchema,
  output: anyOutput("The first item, or undefined for an empty array"),
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

const LastInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
});

type LastProcedure = Procedure<LastInput, unknown, { description: string; tags: string[] }>;

const lastProcedure: LastProcedure = defineProcedure({
  path: ["last"],
  input: LastInputSchema,
  output: anyOutput("The last item, or undefined for an empty array"),
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

const NthInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  index: z.number().describe("The position"),
});

type NthProcedure = Procedure<NthInput, unknown, { description: string; tags: string[] }>;

const nthProcedure: NthProcedure = defineProcedure({
  path: ["nth"],
  input: NthInputSchema,
  output: anyOutput("The item at the index, or undefined"),
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

const ArrLengthInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
});

type ArrLengthProcedure = Procedure<ArrLengthInput, number, { description: string; tags: string[] }>;

const arrLengthProcedure: ArrLengthProcedure = defineProcedure({
  path: ["arrLength"],
  input: ArrLengthInputSchema,
  output: numberOutput("The number of items"),
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
  depth?: number | undefined;
}

const FlattenInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  depth: z.number().optional().describe("How many levels to flatten (default: 1)"),
});

type FlattenProcedure = Procedure<FlattenInput, unknown[], { description: string; tags: string[] }>;

const flattenProcedure: FlattenProcedure = defineProcedure({
  path: ["flatten"],
  input: FlattenInputSchema,
  output: arrayOutput("The flattened items"),
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

const ReverseInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
});

type ReverseProcedure = Procedure<ReverseInput, unknown[], { description: string; tags: string[] }>;

const reverseProcedure: ReverseProcedure = defineProcedure({
  path: ["reverse"],
  input: ReverseInputSchema,
  output: arrayOutput("The items in reverse order"),
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
  key?: string | undefined;
  desc?: boolean | undefined;
}

const SortInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  key: z.string().optional().describe("The key (a field name of the items)"),
  desc: z.boolean().optional().describe("Sort in descending order"),
});

type SortProcedure = Procedure<SortInput, unknown[], { description: string; tags: string[] }>;

const sortProcedure: SortProcedure = defineProcedure({
  path: ["sort"],
  input: SortInputSchema,
  output: arrayOutput("The sorted items"),
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
  end?: number | undefined;
}

const SliceInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  start: z.number().describe("The start position (inclusive)"),
  end: z.number().optional().describe("The end position (exclusive)"),
});

type SliceProcedure = Procedure<SliceInput, unknown[], { description: string; tags: string[] }>;

const sliceProcedure: SliceProcedure = defineProcedure({
  path: ["slice"],
  input: SliceInputSchema,
  output: arrayOutput("The items of the range"),
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

const ArrConcatInputSchema = z.object({
  arrays: z.array(z.array(z.unknown())).describe("The arrays"),
});

type ArrConcatProcedure = Procedure<ArrConcatInput, unknown[], { description: string; tags: string[] }>;

const arrConcatProcedure: ArrConcatProcedure = defineProcedure({
  path: ["arrConcat"],
  input: ArrConcatInputSchema,
  output: arrayOutput("The items of all arrays, in order"),
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
  key?: string | undefined;
}

const UniqueInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  key: z.string().optional().describe("The key (a field name of the items)"),
});

type UniqueProcedure = Procedure<UniqueInput, unknown[], { description: string; tags: string[] }>;

const uniqueProcedure: UniqueProcedure = defineProcedure({
  path: ["unique"],
  input: UniqueInputSchema,
  output: arrayOutput("The items without duplicates"),
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

const GroupByInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  key: z.string().describe("The key (a field name of the items)"),
});

type GroupByProcedure = Procedure<GroupByInput, Record<string, unknown[]>, { description: string; tags: string[] }>;

const groupByProcedure: GroupByProcedure = defineProcedure({
  path: ["groupBy"],
  input: GroupByInputSchema,
  output: z.record(z.string(), z.array(z.unknown())).describe("The items, grouped by the value of the key"),
  metadata: {
    description: "Group array items by key value",
    tags: ["core", "array"],
  },
  handler: async (input: GroupByInput): Promise<Record<string, unknown[]>> => {
    const result: Record<string, unknown[]> = {};
    for (const item of input.items) {
      const keyVal = String((item as Record<string, unknown>)[input.key]);
      // Only an own group: before, a group "constructor" or "toString" found the function of the
      // prototype, and push failed (catalog test, roadmap R29)
      if (!Object.hasOwn(result, keyVal)) {
        Object.defineProperty(result, keyVal, { value: [], writable: true, enumerable: true, configurable: true });
      }
      result[keyVal]!.push(item);
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

const ZipInputSchema = z.object({
  arrays: z.array(z.array(z.unknown())).describe("The arrays"),
});

type ZipProcedure = Procedure<ZipInput, unknown[][], { description: string; tags: string[] }>;

const zipProcedure: ZipProcedure = defineProcedure({
  path: ["zip"],
  input: ZipInputSchema,
  output: z.array(z.array(z.unknown())).describe("One tuple for each index"),
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

const UnzipInputSchema = z.object({
  tuples: z.array(z.array(z.unknown())).describe("The tuples"),
});

type UnzipProcedure = Procedure<UnzipInput, unknown[][], { description: string; tags: string[] }>;

const unzipProcedure: UnzipProcedure = defineProcedure({
  path: ["unzip"],
  input: UnzipInputSchema,
  output: z.array(z.array(z.unknown())).describe("One array for each position of the tuples"),
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
  value?: unknown;
  fromIndex?: number | undefined;
}

const IndexOfInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  value: z.unknown().optional().describe("The value"),
  fromIndex: z.number().optional().describe("The position to start the search from"),
});

type IndexOfProcedure = Procedure<IndexOfInput, number, { description: string; tags: string[] }>;

const indexOfProcedure: IndexOfProcedure = defineProcedure({
  path: ["indexOf"],
  input: IndexOfInputSchema,
  output: numberOutput("The index of the item, or -1"),
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
  value?: unknown;
}

const ContainsInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  value: z.unknown().optional().describe("The value"),
});

type ContainsProcedure = Procedure<ContainsInput, boolean, { description: string; tags: string[] }>;

const containsProcedure: ContainsProcedure = defineProcedure({
  path: ["contains"],
  input: ContainsInputSchema,
  output: booleanOutput("True when the array contains the item"),
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
  value?: unknown;
}

const PushInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  value: z.unknown().optional().describe("The value"),
});

type PushProcedure = Procedure<PushInput, unknown[], { description: string; tags: string[] }>;

const pushProcedure: PushProcedure = defineProcedure({
  path: ["push"],
  input: PushInputSchema,
  output: arrayOutput("The items with the new items at the end"),
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
  value?: unknown;
}

const UnshiftInputSchema = z.object({
  items: z.array(z.unknown()).describe("The array"),
  value: z.unknown().optional().describe("The value"),
});

type UnshiftProcedure = Procedure<UnshiftInput, unknown[], { description: string; tags: string[] }>;

const unshiftProcedure: UnshiftProcedure = defineProcedure({
  path: ["unshift"],
  input: UnshiftInputSchema,
  output: arrayOutput("The items with the new items at the start"),
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
  step?: number | undefined;
}

const RangeInputSchema = z.object({
  start: z.number().describe("The start position (inclusive)"),
  end: z.number().describe("The end position (exclusive)"),
  step: z.number().optional().describe("The step (default: 1)"),
});

type RangeProcedure = Procedure<RangeInput, number[], { description: string; tags: string[] }>;

/** The maximum number of items of `client.range`. */
export const MAX_RANGE_LENGTH = 1_000_000;

const rangeProcedure: RangeProcedure = defineProcedure({
  path: ["range"],
  input: RangeInputSchema,
  output: z.array(numberOutput("A number of the range")).describe("The numbers from start to end"),
  metadata: {
    description: "Generate array of numbers from start to end (exclusive)",
    tags: ["core", "array"],
  },
  handler: async (input: RangeInput): Promise<number[]> => {
    const step = input.step ?? 1;
    for (const [name, value] of [["start", input.start], ["end", input.end], ["step", step]] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`range: ${name} must be a finite number, got ${String(value)}`);
      }
    }
    if (step === 0) {
      return [];
    }
    // The length comes first, and item k is start + k * step. (Deep dive SITE-6: before, the loop
    // added step to the last value. At 1e17, start + 1 is start, so the loop never ended.)
    const length = Math.max(0, Math.ceil((input.end - input.start) / step));
    if (length > MAX_RANGE_LENGTH) {
      throw new Error(`range: ${length} items is more than the limit of ${MAX_RANGE_LENGTH}`);
    }
    const result: number[] = [];
    for (let k = 0; k < length; k++) {
      const value = input.start + k * step;
      // A rounding error can make the last value reach end: it is not in the range
      if (step > 0 ? value >= input.end : value <= input.end) break;
      result.push(value);
    }
    return result;
  },
});

// =============================================================================
// Filter Procedure (Core Logic + Filtering Separation)
// =============================================================================

interface FilterInput {
  /** Array to filter */
  items: unknown[];
  /** Property to match against */
  key?: string | undefined;
  /** Value to match (equality check) */
  value?: unknown | undefined;
  /** Values to match (any of these) */
  values?: unknown[] | undefined;
  /** Match mode: 'equals', 'not', 'in', 'notIn', 'contains', 'startsWith', 'endsWith' */
  match?: 'equals' | 'not' | 'in' | 'notIn' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte' | undefined;
  /** Invert the filter */
  invert?: boolean | undefined;
}

const FilterInputSchema = z.object({
  items: z.array(z.unknown()).describe("Array to filter"),
  key: z.string().optional().describe("Property to match against"),
  value: z.unknown().optional().describe("Value to match (equality check)"),
  values: z.array(z.unknown()).optional().describe("Values to match (any of these)"),
  match: z.enum(["equals", "not", "in", "notIn", "contains", "startsWith", "endsWith", "gt", "gte", "lt", "lte"]).optional().describe("Match mode: 'equals', 'not', 'in', 'notIn', 'contains', 'startsWith', 'endsWith'"),
  invert: z.boolean().optional().describe("Invert the filter"),
});

type FilterProcedure = Procedure<FilterInput, unknown[], { description: string; tags: string[] }>;

const filterProcedure: FilterProcedure = defineProcedure({
  path: ["filter"],
  input: FilterInputSchema,
  output: arrayOutput("The items that pass the condition"),
  metadata: {
    description: "Filter array by property value or predicate",
    tags: ["core", "array", "filter"],
  },
  handler: async (input: FilterInput): Promise<unknown[]> => {
    const { items, key, value, values, match = 'equals', invert = false } = input;

    const predicate = (item: unknown): boolean => {
      const itemValue = key ? (item as Record<string, unknown>)[key] : item;

      let result: boolean;
      switch (match) {
        case 'equals':
          result = itemValue === value;
          break;
        case 'not':
          result = itemValue !== value;
          break;
        case 'in':
          result = (values ?? []).includes(itemValue);
          break;
        case 'notIn':
          result = !(values ?? []).includes(itemValue);
          break;
        case 'contains':
          result = typeof itemValue === 'string' && typeof value === 'string' && itemValue.includes(value);
          break;
        case 'startsWith':
          result = typeof itemValue === 'string' && typeof value === 'string' && itemValue.startsWith(value);
          break;
        case 'endsWith':
          result = typeof itemValue === 'string' && typeof value === 'string' && itemValue.endsWith(value);
          break;
        case 'gt':
          result = typeof itemValue === 'number' && typeof value === 'number' && itemValue > value;
          break;
        case 'gte':
          result = typeof itemValue === 'number' && typeof value === 'number' && itemValue >= value;
          break;
        case 'lt':
          result = typeof itemValue === 'number' && typeof value === 'number' && itemValue < value;
          break;
        case 'lte':
          result = typeof itemValue === 'number' && typeof value === 'number' && itemValue <= value;
          break;
        default:
          result = Boolean(itemValue);
      }

      return invert ? !result : result;
    };

    return items.filter(predicate);
  },
});

// =============================================================================
// Where Procedure (Filter shorthand)
// =============================================================================

interface WhereInput {
  /** Array to filter */
  items: unknown[];
  /** Object with key-value pairs to match */
  where: Record<string, unknown>;
}

const WhereInputSchema = z.object({
  items: z.array(z.unknown()).describe("Array to filter"),
  where: z.record(z.string(), z.unknown()).describe("Object with key-value pairs to match"),
});

type WhereProcedure = Procedure<WhereInput, unknown[], { description: string; tags: string[] }>;

const whereProcedure: WhereProcedure = defineProcedure({
  path: ["where"],
  input: WhereInputSchema,
  output: arrayOutput("The items whose fields match"),
  metadata: {
    description: "Filter array where all key-value pairs match",
    tags: ["core", "array", "filter"],
  },
  handler: async (input: WhereInput): Promise<unknown[]> => {
    const { items, where } = input;
    return items.filter((item) => {
      const obj = item as Record<string, unknown>;
      return Object.entries(where).every(([key, value]) => obj[key] === value);
    });
  },
});

// =============================================================================
// Pluck Procedure (Extract single property)
// =============================================================================

interface PluckInput {
  /** Array of objects */
  items: unknown[];
  /** Property to extract */
  key: string;
}

const PluckInputSchema = z.object({
  items: z.array(z.unknown()).describe("Array of objects"),
  key: z.string().describe("Property to extract"),
});

type PluckProcedure = Procedure<PluckInput, unknown[], { description: string; tags: string[] }>;

const pluckProcedure: PluckProcedure = defineProcedure({
  path: ["pluck"],
  input: PluckInputSchema,
  output: arrayOutput("The value of the field of each item"),
  metadata: {
    description: "Extract single property from all items",
    tags: ["core", "array", "transform"],
  },
  handler: async (input: PluckInput): Promise<unknown[]> => {
    return input.items.map((item) => (item as Record<string, unknown>)[input.key]);
  },
});

// =============================================================================
// ArrPick Procedure (Select multiple properties from array items)
// =============================================================================

interface ArrPickInput {
  /** Array of objects */
  items: unknown[];
  /** Properties to keep */
  keys: string[];
}

const ArrPickInputSchema = z.object({
  items: z.array(z.unknown()).describe("Array of objects"),
  keys: z.array(z.string()).describe("Properties to keep"),
});

type ArrPickProcedure = Procedure<ArrPickInput, unknown[], { description: string; tags: string[] }>;

const arrPickProcedure: ArrPickProcedure = defineProcedure({
  path: ["arrPick"],
  input: ArrPickInputSchema,
  output: z.array(z.record(z.string(), z.unknown())).describe("Each item with only the given fields"),
  metadata: {
    description: "Keep only specified properties from all items",
    tags: ["core", "array", "transform"],
  },
  handler: async (input: ArrPickInput): Promise<unknown[]> => {
    return input.items.map((item) => {
      const obj = item as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const key of input.keys) {
        // Only own fields, as client.pick: before, "toString" picked a function of the prototype
        // (catalog test, roadmap R29)
        if (Object.hasOwn(obj, key)) {
          result[key] = obj[key];
        }
      }
      return result;
    });
  },
});

// =============================================================================
// ArrOmit Procedure (Remove properties from array items)
// =============================================================================

interface ArrOmitInput {
  /** Array of objects */
  items: unknown[];
  /** Properties to remove */
  keys: string[];
}

const ArrOmitInputSchema = z.object({
  items: z.array(z.unknown()).describe("Array of objects"),
  keys: z.array(z.string()).describe("Properties to remove"),
});

type ArrOmitProcedure = Procedure<ArrOmitInput, unknown[], { description: string; tags: string[] }>;

const arrOmitProcedure: ArrOmitProcedure = defineProcedure({
  path: ["arrOmit"],
  input: ArrOmitInputSchema,
  output: z.array(z.record(z.string(), z.unknown())).describe("Each item without the given fields"),
  metadata: {
    description: "Remove specified properties from all array items",
    tags: ["core", "array", "transform"],
  },
  handler: async (input: ArrOmitInput): Promise<unknown[]> => {
    const keysToOmit = new Set(input.keys);
    return input.items.map((item) => {
      const obj = item as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!keysToOmit.has(key)) {
          result[key] = value;
        }
      }
      return result;
    });
  },
});

// =============================================================================
// Partition Procedure (Split by predicate)
// =============================================================================

interface PartitionInput {
  /** Array to partition */
  items: unknown[];
  /** Property to check for truthiness */
  key: string;
  /** Value to match for truthy partition */
  value?: unknown | undefined;
}

const PartitionInputSchema = z.object({
  items: z.array(z.unknown()).describe("Array to partition"),
  key: z.string().describe("Property to check for truthiness"),
  value: z.unknown().optional().describe("Value to match for truthy partition"),
});

interface PartitionOutput {
  /** Items that matched */
  truthy: unknown[];
  /** Items that didn't match */
  falsy: unknown[];
}

const PartitionOutputSchema = z.looseObject({
  truthy: z.array(z.unknown()).describe("The items that pass the condition"),
  falsy: z.array(z.unknown()).describe("The items that do not pass the condition"),
}) as z.ZodType<PartitionOutput>;

type PartitionProcedure = Procedure<PartitionInput, PartitionOutput, { description: string; tags: string[] }>;

const partitionProcedure: PartitionProcedure = defineProcedure({
  path: ["partition"],
  input: PartitionInputSchema,
  output: PartitionOutputSchema,
  metadata: {
    description: "Split array into two arrays based on predicate",
    tags: ["core", "array", "filter"],
  },
  handler: async (input: PartitionInput): Promise<PartitionOutput> => {
    const truthy: unknown[] = [];
    const falsy: unknown[] = [];

    for (const item of input.items) {
      const itemValue = (item as Record<string, unknown>)[input.key];
      const matches = input.value !== undefined ? itemValue === input.value : Boolean(itemValue);
      if (matches) {
        truthy.push(item);
      } else {
        falsy.push(item);
      }
    }

    return { truthy, falsy };
  },
});

// =============================================================================
// Count Procedure (Count matching items)
// =============================================================================

interface CountInput {
  /** Array to count */
  items: unknown[];
  /** Optional property to check for truthiness */
  key?: string | undefined;
  /** Optional value to match */
  value?: unknown | undefined;
}

const CountInputSchema = z.object({
  items: z.array(z.unknown()).describe("Array to count"),
  key: z.string().optional().describe("Optional property to check for truthiness"),
  value: z.unknown().optional().describe("Optional value to match"),
});

type CountProcedure = Procedure<CountInput, number, { description: string; tags: string[] }>;

const countProcedure: CountProcedure = defineProcedure({
  path: ["count"],
  input: CountInputSchema,
  output: numberOutput("The number of matching items"),
  metadata: {
    description: "Count items matching criteria (or total if no criteria)",
    tags: ["core", "array", "filter"],
  },
  handler: async (input: CountInput): Promise<number> => {
    if (!input.key) {
      return input.items.length;
    }

    return input.items.filter((item) => {
      const itemValue = (item as Record<string, unknown>)[input.key!];
      return input.value !== undefined ? itemValue === input.value : Boolean(itemValue);
    }).length;
  },
});

// =============================================================================
// Export Array Procedures
// =============================================================================

/**
 * All array procedures (before namespacing).
 */
const arrayProceduresRaw: AnyProcedure[] = [
  // Access
  firstProcedure as AnyProcedure,
  lastProcedure as AnyProcedure,
  nthProcedure as AnyProcedure,
  arrLengthProcedure as AnyProcedure,
  // Transform
  flattenProcedure as AnyProcedure,
  reverseProcedure as AnyProcedure,
  sortProcedure as AnyProcedure,
  sliceProcedure as AnyProcedure,
  arrConcatProcedure as AnyProcedure,
  uniqueProcedure as AnyProcedure,
  groupByProcedure as AnyProcedure,
  zipProcedure as AnyProcedure,
  unzipProcedure as AnyProcedure,
  // Search
  indexOfProcedure as AnyProcedure,
  containsProcedure as AnyProcedure,
  // Mutation (immutable)
  pushProcedure as AnyProcedure,
  unshiftProcedure as AnyProcedure,
  // Generation
  rangeProcedure as AnyProcedure,
  // Filtering (Core Logic + Filtering Separation)
  filterProcedure as AnyProcedure,
  whereProcedure as AnyProcedure,
  pluckProcedure as AnyProcedure,
  arrPickProcedure as AnyProcedure,
  arrOmitProcedure as AnyProcedure,
  partitionProcedure as AnyProcedure,
  countProcedure as AnyProcedure,
];

/**
 * All array procedures namespaced under "client".
 */
// Each one calculates its output from its input: no reads, no changes (CAPABILITIES-2026-10)
export const arrayProcedures: AnyProcedure[] = namespace(["client"], withEffects(PURE_EFFECTS, arrayProceduresRaw));

/**
 * Array procedures module for registration.
 */
export const arrayModule: { name: string; procedures: AnyProcedure[] } = {
  name: "client-array",
  procedures: arrayProcedures,
};

// Re-export individual procedures for direct access
export {
  // Access
  firstProcedure,
  lastProcedure,
  nthProcedure,
  arrLengthProcedure,
  // Transform
  flattenProcedure,
  reverseProcedure,
  sortProcedure,
  sliceProcedure,
  arrConcatProcedure,
  uniqueProcedure,
  groupByProcedure,
  zipProcedure,
  unzipProcedure,
  // Search
  indexOfProcedure,
  containsProcedure,
  // Mutation (immutable)
  pushProcedure,
  unshiftProcedure,
  // Generation
  rangeProcedure,
  // Filtering (Core Logic + Filtering Separation)
  filterProcedure,
  whereProcedure,
  pluckProcedure,
  arrPickProcedure,
  arrOmitProcedure,
  partitionProcedure,
  countProcedure,
};
