/**
 * Comparison Procedures
 *
 * Equality and relational comparison operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.eq, client.gt).
 */

import { z } from "zod";
import { booleanOutput } from "./outputs.js";
import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure } from "../types.js";

// =============================================================================
// Eq Procedure (Strict Equality)
// =============================================================================

interface EqInput {
  a?: unknown;
  b?: unknown;
}

const EqInputSchema = z.object({
  a: z.unknown().optional().describe("The first operand"),
  b: z.unknown().optional().describe("The second operand"),
});

type EqProcedure = Procedure<EqInput, boolean, { description: string; tags: string[] }>;

const eqProcedure: EqProcedure = defineProcedure({
  path: ["eq"],
  input: EqInputSchema,
  output: booleanOutput("True when a equals b"),
  metadata: {
    description: "Strict equality (===)",
    tags: ["core", "comparison"],
  },
  handler: async (input: EqInput): Promise<boolean> => {
    return input.a === input.b;
  },
});

// =============================================================================
// Neq Procedure (Strict Inequality)
// =============================================================================

interface NeqInput {
  a?: unknown;
  b?: unknown;
}

const NeqInputSchema = z.object({
  a: z.unknown().optional().describe("The first operand"),
  b: z.unknown().optional().describe("The second operand"),
});

type NeqProcedure = Procedure<NeqInput, boolean, { description: string; tags: string[] }>;

const neqProcedure: NeqProcedure = defineProcedure({
  path: ["neq"],
  input: NeqInputSchema,
  output: booleanOutput("True when a does not equal b"),
  metadata: {
    description: "Strict inequality (!==)",
    tags: ["core", "comparison"],
  },
  handler: async (input: NeqInput): Promise<boolean> => {
    return input.a !== input.b;
  },
});

// =============================================================================
// Gt Procedure (Greater Than)
// =============================================================================

interface GtInput {
  a: number;
  b: number;
}

const GtInputSchema = z.object({
  a: z.number().describe("The first operand"),
  b: z.number().describe("The second operand"),
});

type GtProcedure = Procedure<GtInput, boolean, { description: string; tags: string[] }>;

const gtProcedure: GtProcedure = defineProcedure({
  path: ["gt"],
  input: GtInputSchema,
  output: booleanOutput("True when a is greater than b"),
  metadata: {
    description: "Greater than (a > b)",
    tags: ["core", "comparison"],
  },
  handler: async (input: GtInput): Promise<boolean> => {
    return input.a > input.b;
  },
});

// =============================================================================
// Gte Procedure (Greater Than or Equal)
// =============================================================================

interface GteInput {
  a: number;
  b: number;
}

const GteInputSchema = z.object({
  a: z.number().describe("The first operand"),
  b: z.number().describe("The second operand"),
});

type GteProcedure = Procedure<GteInput, boolean, { description: string; tags: string[] }>;

const gteProcedure: GteProcedure = defineProcedure({
  path: ["gte"],
  input: GteInputSchema,
  output: booleanOutput("True when a is greater than or equal to b"),
  metadata: {
    description: "Greater than or equal (a >= b)",
    tags: ["core", "comparison"],
  },
  handler: async (input: GteInput): Promise<boolean> => {
    return input.a >= input.b;
  },
});

// =============================================================================
// Lt Procedure (Less Than)
// =============================================================================

interface LtInput {
  a: number;
  b: number;
}

const LtInputSchema = z.object({
  a: z.number().describe("The first operand"),
  b: z.number().describe("The second operand"),
});

type LtProcedure = Procedure<LtInput, boolean, { description: string; tags: string[] }>;

const ltProcedure: LtProcedure = defineProcedure({
  path: ["lt"],
  input: LtInputSchema,
  output: booleanOutput("True when a is less than b"),
  metadata: {
    description: "Less than (a < b)",
    tags: ["core", "comparison"],
  },
  handler: async (input: LtInput): Promise<boolean> => {
    return input.a < input.b;
  },
});

// =============================================================================
// Lte Procedure (Less Than or Equal)
// =============================================================================

interface LteInput {
  a: number;
  b: number;
}

const LteInputSchema = z.object({
  a: z.number().describe("The first operand"),
  b: z.number().describe("The second operand"),
});

type LteProcedure = Procedure<LteInput, boolean, { description: string; tags: string[] }>;

const lteProcedure: LteProcedure = defineProcedure({
  path: ["lte"],
  input: LteInputSchema,
  output: booleanOutput("True when a is less than or equal to b"),
  metadata: {
    description: "Less than or equal (a <= b)",
    tags: ["core", "comparison"],
  },
  handler: async (input: LteInput): Promise<boolean> => {
    return input.a <= input.b;
  },
});

// =============================================================================
// Between Procedure
// =============================================================================

interface BetweenInput {
  value: number;
  min: number;
  max: number;
  inclusive?: boolean | undefined;
}

const BetweenInputSchema = z.object({
  value: z.number().describe("The value"),
  min: z.number().describe("The lower bound"),
  max: z.number().describe("The upper bound"),
  inclusive: z.boolean().optional().describe("Include the bounds (default: true)"),
});

type BetweenProcedure = Procedure<BetweenInput, boolean, { description: string; tags: string[] }>;

const betweenProcedure: BetweenProcedure = defineProcedure({
  path: ["between"],
  input: BetweenInputSchema,
  output: booleanOutput("True when the value is in the range"),
  metadata: {
    description: "Check if value is between min and max (inclusive by default)",
    tags: ["core", "comparison"],
  },
  handler: async (input: BetweenInput): Promise<boolean> => {
    const inclusive = input.inclusive !== false;
    if (inclusive) {
      return input.value >= input.min && input.value <= input.max;
    }
    return input.value > input.min && input.value < input.max;
  },
});

// =============================================================================
// Export Comparison Procedures
// =============================================================================

/**
 * All comparison procedures (before namespacing).
 */
const comparisonProceduresRaw: AnyProcedure[] = [
  eqProcedure as AnyProcedure,
  neqProcedure as AnyProcedure,
  gtProcedure as AnyProcedure,
  gteProcedure as AnyProcedure,
  ltProcedure as AnyProcedure,
  lteProcedure as AnyProcedure,
  betweenProcedure as AnyProcedure,
];

/**
 * All comparison procedures namespaced under "client".
 */
export const comparisonProcedures: AnyProcedure[] = namespace(["client"], comparisonProceduresRaw);

/**
 * Comparison procedures module for registration.
 */
export const comparisonModule: { name: string; procedures: AnyProcedure[] } = {
  name: "client-comparison",
  procedures: comparisonProcedures,
};

// Re-export individual procedures for direct access
export {
  eqProcedure,
  neqProcedure,
  gtProcedure,
  gteProcedure,
  ltProcedure,
  lteProcedure,
  betweenProcedure,
};
