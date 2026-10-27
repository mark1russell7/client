/**
 * Math Procedures
 *
 * Arithmetic and mathematical operations for procedure aggregation.
 * The namespace of all these procedures is "client": for example client.add and client.multiply.
 */

import { z } from "zod";
import { numberOutput } from "./outputs.js";
import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure } from "../types.js";
import { PURE_EFFECTS, withEffects } from "../effects.js";

// =============================================================================
// Add Procedure
// =============================================================================

interface AddInput {
  a: number;
  b: number;
}

const AddInputSchema = z.object({
  a: z.number().describe("The first operand"),
  b: z.number().describe("The second operand"),
});

type AddProcedure = Procedure<AddInput, number, { description: string; tags: string[] }>;

const addProcedure: AddProcedure = defineProcedure({
  path: ["add"],
  input: AddInputSchema,
  output: numberOutput("The sum of a and b"),
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

const SubtractInputSchema = z.object({
  a: z.number().describe("The first operand"),
  b: z.number().describe("The second operand"),
});

type SubtractProcedure = Procedure<SubtractInput, number, { description: string; tags: string[] }>;

const subtractProcedure: SubtractProcedure = defineProcedure({
  path: ["subtract"],
  input: SubtractInputSchema,
  output: numberOutput("a minus b"),
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

const MultiplyInputSchema = z.object({
  a: z.number().describe("The first operand"),
  b: z.number().describe("The second operand"),
});

type MultiplyProcedure = Procedure<MultiplyInput, number, { description: string; tags: string[] }>;

const multiplyProcedure: MultiplyProcedure = defineProcedure({
  path: ["multiply"],
  input: MultiplyInputSchema,
  output: numberOutput("The product of a and b"),
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

const DivideInputSchema = z.object({
  a: z.number().describe("The first operand"),
  b: z.number().describe("The second operand"),
});

type DivideProcedure = Procedure<DivideInput, number, { description: string; tags: string[] }>;

const divideProcedure: DivideProcedure = defineProcedure({
  path: ["divide"],
  input: DivideInputSchema,
  output: numberOutput("a divided by b"),
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

const ModInputSchema = z.object({
  a: z.number().describe("The first operand"),
  b: z.number().describe("The second operand"),
});

type ModProcedure = Procedure<ModInput, number, { description: string; tags: string[] }>;

const modProcedure: ModProcedure = defineProcedure({
  path: ["mod"],
  input: ModInputSchema,
  output: numberOutput("The remainder of a divided by b"),
  metadata: {
    description: "Modulo (remainder of a / b). It refuses b = 0, as client.divide does.",
    tags: ["core", "math"],
  },
  handler: async (input: ModInput): Promise<number> => {
    // Before, b = 0 gave NaN, and client.divide refused it (catalog test, roadmap R29)
    if (input.b === 0) {
      throw new Error("Division by zero");
    }
    return input.a % input.b;
  },
});

// =============================================================================
// Abs Procedure
// =============================================================================

interface AbsInput {
  value: number;
}

const AbsInputSchema = z.object({
  value: z.number().describe("The value"),
});

type AbsProcedure = Procedure<AbsInput, number, { description: string; tags: string[] }>;

const absProcedure: AbsProcedure = defineProcedure({
  path: ["abs"],
  input: AbsInputSchema,
  output: numberOutput("The absolute value"),
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

const MinInputSchema = z.object({
  values: z.array(z.number()).describe("The values"),
});

type MinProcedure = Procedure<MinInput, number, { description: string; tags: string[] }>;

const minProcedure: MinProcedure = defineProcedure({
  path: ["min"],
  input: MinInputSchema,
  output: numberOutput("The smallest value"),
  metadata: {
    description: "Minimum value from array",
    tags: ["core", "math"],
  },
  handler: async (input: MinInput): Promise<number> => {
    if (input.values.length === 0) {
      return Infinity;
    }
    // A loop, not a spread: a long array as arguments overflows the stack (audit pass 2)
    let min = Infinity;
    for (const value of input.values) min = Math.min(min, value);
    return min;
  },
});

// =============================================================================
// Max Procedure
// =============================================================================

interface MaxInput {
  values: number[];
}

const MaxInputSchema = z.object({
  values: z.array(z.number()).describe("The values"),
});

type MaxProcedure = Procedure<MaxInput, number, { description: string; tags: string[] }>;

const maxProcedure: MaxProcedure = defineProcedure({
  path: ["max"],
  input: MaxInputSchema,
  output: numberOutput("The largest value"),
  metadata: {
    description: "Maximum value from array",
    tags: ["core", "math"],
  },
  handler: async (input: MaxInput): Promise<number> => {
    if (input.values.length === 0) {
      return -Infinity;
    }
    let max = -Infinity;
    for (const value of input.values) max = Math.max(max, value);
    return max;
  },
});

// =============================================================================
// Sum Procedure
// =============================================================================

interface SumInput {
  values: number[];
}

const SumInputSchema = z.object({
  values: z.array(z.number()).describe("The values"),
});

type SumProcedure = Procedure<SumInput, number, { description: string; tags: string[] }>;

const sumProcedure: SumProcedure = defineProcedure({
  path: ["sum"],
  input: SumInputSchema,
  output: numberOutput("The sum of the values"),
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

const PowInputSchema = z.object({
  base: z.number().describe("The base"),
  exp: z.number().describe("The exponent"),
});

type PowProcedure = Procedure<PowInput, number, { description: string; tags: string[] }>;

const powProcedure: PowProcedure = defineProcedure({
  path: ["pow"],
  input: PowInputSchema,
  output: numberOutput("The base to the power of the exponent"),
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

const SqrtInputSchema = z.object({
  value: z.number().describe("The value"),
});

type SqrtProcedure = Procedure<SqrtInput, number, { description: string; tags: string[] }>;

const sqrtProcedure: SqrtProcedure = defineProcedure({
  path: ["sqrt"],
  input: SqrtInputSchema,
  output: numberOutput("The square root"),
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

const FloorInputSchema = z.object({
  value: z.number().describe("The value"),
});

type FloorProcedure = Procedure<FloorInput, number, { description: string; tags: string[] }>;

const floorProcedure: FloorProcedure = defineProcedure({
  path: ["floor"],
  input: FloorInputSchema,
  output: numberOutput("The value rounded down"),
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

const CeilInputSchema = z.object({
  value: z.number().describe("The value"),
});

type CeilProcedure = Procedure<CeilInput, number, { description: string; tags: string[] }>;

const ceilProcedure: CeilProcedure = defineProcedure({
  path: ["ceil"],
  input: CeilInputSchema,
  output: numberOutput("The value rounded up"),
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
  decimals?: number | undefined;
}

const RoundInputSchema = z.object({
  value: z.number().describe("The value"),
  decimals: z.number().optional().describe("The number of decimal places (default: 0)"),
});

type RoundProcedure = Procedure<RoundInput, number, { description: string; tags: string[] }>;

const roundProcedure: RoundProcedure = defineProcedure({
  path: ["round"],
  input: RoundInputSchema,
  output: numberOutput("The value rounded to the nearest number"),
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
// Each one calculates its output from its input: no reads, no changes (CAPABILITIES-2026-10)
export const mathProcedures: AnyProcedure[] = namespace(["client"], withEffects(PURE_EFFECTS, mathProceduresRaw));

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
