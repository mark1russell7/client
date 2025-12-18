/**
 * Math Procedures
 *
 * Arithmetic and mathematical operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.add, client.multiply).
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
// Add Procedure
// =============================================================================

interface AddInput {
  a: number;
  b: number;
}

type AddProcedure = Procedure<AddInput, number, { description: string; tags: string[] }>;

const addProcedure: AddProcedure = defineProcedure({
  path: ["add"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Add two numbers",
    tags: ["core", "math"],
  },
  handler: async (input: AddInput): Promise<number> => {
    return input.a + input.b;
  },
});

// =============================================================================
// Subtract Procedure
// =============================================================================

interface SubtractInput {
  a: number;
  b: number;
}

type SubtractProcedure = Procedure<SubtractInput, number, { description: string; tags: string[] }>;

const subtractProcedure: SubtractProcedure = defineProcedure({
  path: ["subtract"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Subtract b from a",
    tags: ["core", "math"],
  },
  handler: async (input: SubtractInput): Promise<number> => {
    return input.a - input.b;
  },
});

// =============================================================================
// Multiply Procedure
// =============================================================================

interface MultiplyInput {
  a: number;
  b: number;
}

type MultiplyProcedure = Procedure<MultiplyInput, number, { description: string; tags: string[] }>;

const multiplyProcedure: MultiplyProcedure = defineProcedure({
  path: ["multiply"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Multiply two numbers",
    tags: ["core", "math"],
  },
  handler: async (input: MultiplyInput): Promise<number> => {
    return input.a * input.b;
  },
});

// =============================================================================
// Divide Procedure
// =============================================================================

interface DivideInput {
  a: number;
  b: number;
}

type DivideProcedure = Procedure<DivideInput, number, { description: string; tags: string[] }>;

const divideProcedure: DivideProcedure = defineProcedure({
  path: ["divide"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Divide a by b",
    tags: ["core", "math"],
  },
  handler: async (input: DivideInput): Promise<number> => {
    if (input.b === 0) {
      throw new Error("Division by zero");
    }
    return input.a / input.b;
  },
});

// =============================================================================
// Mod Procedure
// =============================================================================

interface ModInput {
  a: number;
  b: number;
}

type ModProcedure = Procedure<ModInput, number, { description: string; tags: string[] }>;

const modProcedure: ModProcedure = defineProcedure({
  path: ["mod"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Modulo (remainder of a / b)",
    tags: ["core", "math"],
  },
  handler: async (input: ModInput): Promise<number> => {
    return input.a % input.b;
  },
});

// =============================================================================
// Abs Procedure
// =============================================================================

interface AbsInput {
  value: number;
}

type AbsProcedure = Procedure<AbsInput, number, { description: string; tags: string[] }>;

const absProcedure: AbsProcedure = defineProcedure({
  path: ["abs"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Absolute value",
    tags: ["core", "math"],
  },
  handler: async (input: AbsInput): Promise<number> => {
    return Math.abs(input.value);
  },
});

// =============================================================================
// Min Procedure
// =============================================================================

interface MinInput {
  values: number[];
}

type MinProcedure = Procedure<MinInput, number, { description: string; tags: string[] }>;

const minProcedure: MinProcedure = defineProcedure({
  path: ["min"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Minimum value from array",
    tags: ["core", "math"],
  },
  handler: async (input: MinInput): Promise<number> => {
    if (input.values.length === 0) {
      return Infinity;
    }
    return Math.min(...input.values);
  },
});

// =============================================================================
// Max Procedure
// =============================================================================

interface MaxInput {
  values: number[];
}

type MaxProcedure = Procedure<MaxInput, number, { description: string; tags: string[] }>;

const maxProcedure: MaxProcedure = defineProcedure({
  path: ["max"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Maximum value from array",
    tags: ["core", "math"],
  },
  handler: async (input: MaxInput): Promise<number> => {
    if (input.values.length === 0) {
      return -Infinity;
    }
    return Math.max(...input.values);
  },
});

// =============================================================================
// Sum Procedure
// =============================================================================

interface SumInput {
  values: number[];
}

type SumProcedure = Procedure<SumInput, number, { description: string; tags: string[] }>;

const sumProcedure: SumProcedure = defineProcedure({
  path: ["sum"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Sum of all values in array",
    tags: ["core", "math"],
  },
  handler: async (input: SumInput): Promise<number> => {
    return input.values.reduce((acc, val) => acc + val, 0);
  },
});

// =============================================================================
// Pow Procedure
// =============================================================================

interface PowInput {
  base: number;
  exp: number;
}

type PowProcedure = Procedure<PowInput, number, { description: string; tags: string[] }>;

const powProcedure: PowProcedure = defineProcedure({
  path: ["pow"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Raise base to exponent power",
    tags: ["core", "math"],
  },
  handler: async (input: PowInput): Promise<number> => {
    return Math.pow(input.base, input.exp);
  },
});

// =============================================================================
// Sqrt Procedure
// =============================================================================

interface SqrtInput {
  value: number;
}

type SqrtProcedure = Procedure<SqrtInput, number, { description: string; tags: string[] }>;

const sqrtProcedure: SqrtProcedure = defineProcedure({
  path: ["sqrt"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Square root",
    tags: ["core", "math"],
  },
  handler: async (input: SqrtInput): Promise<number> => {
    return Math.sqrt(input.value);
  },
});

// =============================================================================
// Floor Procedure
// =============================================================================

interface FloorInput {
  value: number;
}

type FloorProcedure = Procedure<FloorInput, number, { description: string; tags: string[] }>;

const floorProcedure: FloorProcedure = defineProcedure({
  path: ["floor"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Round down to nearest integer",
    tags: ["core", "math"],
  },
  handler: async (input: FloorInput): Promise<number> => {
    return Math.floor(input.value);
  },
});

// =============================================================================
// Ceil Procedure
// =============================================================================

interface CeilInput {
  value: number;
}

type CeilProcedure = Procedure<CeilInput, number, { description: string; tags: string[] }>;

const ceilProcedure: CeilProcedure = defineProcedure({
  path: ["ceil"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Round up to nearest integer",
    tags: ["core", "math"],
  },
  handler: async (input: CeilInput): Promise<number> => {
    return Math.ceil(input.value);
  },
});

// =============================================================================
// Round Procedure
// =============================================================================

interface RoundInput {
  value: number;
  decimals?: number;
}

type RoundProcedure = Procedure<RoundInput, number, { description: string; tags: string[] }>;

const roundProcedure: RoundProcedure = defineProcedure({
  path: ["round"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Round to nearest integer or specified decimal places",
    tags: ["core", "math"],
  },
  handler: async (input: RoundInput): Promise<number> => {
    const decimals = input.decimals ?? 0;
    const factor = Math.pow(10, decimals);
    return Math.round(input.value * factor) / factor;
  },
});

// =============================================================================
// Export Math Procedures
// =============================================================================

/**
 * All math procedures (before namespacing).
 */
const mathProceduresRaw: AnyProcedure[] = [
  addProcedure as AnyProcedure,
  subtractProcedure as AnyProcedure,
  multiplyProcedure as AnyProcedure,
  divideProcedure as AnyProcedure,
  modProcedure as AnyProcedure,
  absProcedure as AnyProcedure,
  minProcedure as AnyProcedure,
  maxProcedure as AnyProcedure,
  sumProcedure as AnyProcedure,
  powProcedure as AnyProcedure,
  sqrtProcedure as AnyProcedure,
  floorProcedure as AnyProcedure,
  ceilProcedure as AnyProcedure,
  roundProcedure as AnyProcedure,
];

/**
 * All math procedures namespaced under "client".
 */
export const mathProcedures: AnyProcedure[] = namespace(["client"], mathProceduresRaw);

/**
 * Math procedures module for registration.
 */
export const mathModule: { name: string; procedures: AnyProcedure[] } = {
  name: "client-math",
  procedures: mathProcedures,
};

// Re-export individual procedures for direct access
export {
  addProcedure,
  subtractProcedure,
  multiplyProcedure,
  divideProcedure,
  modProcedure,
  absProcedure,
  minProcedure,
  maxProcedure,
  sumProcedure,
  powProcedure,
  sqrtProcedure,
  floorProcedure,
  ceilProcedure,
  roundProcedure,
};
