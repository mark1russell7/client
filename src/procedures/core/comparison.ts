/**
 * Comparison Procedures
 *
 * Equality and relational comparison operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.eq, client.gt).
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
// Eq Procedure (Strict Equality)
// =============================================================================

interface EqInput {
  a: unknown;
  b: unknown;
}

type EqProcedure = Procedure<EqInput, boolean, { description: string; tags: string[] }>;

const eqProcedure: EqProcedure = defineProcedure({
  path: ["eq"],
  input: anySchema as any,
  output: anySchema as any,
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
  a: unknown;
  b: unknown;
}

type NeqProcedure = Procedure<NeqInput, boolean, { description: string; tags: string[] }>;

const neqProcedure: NeqProcedure = defineProcedure({
  path: ["neq"],
  input: anySchema as any,
  output: anySchema as any,
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

type GtProcedure = Procedure<GtInput, boolean, { description: string; tags: string[] }>;

const gtProcedure: GtProcedure = defineProcedure({
  path: ["gt"],
  input: anySchema as any,
  output: anySchema as any,
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

type GteProcedure = Procedure<GteInput, boolean, { description: string; tags: string[] }>;

const gteProcedure: GteProcedure = defineProcedure({
  path: ["gte"],
  input: anySchema as any,
  output: anySchema as any,
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

type LtProcedure = Procedure<LtInput, boolean, { description: string; tags: string[] }>;

const ltProcedure: LtProcedure = defineProcedure({
  path: ["lt"],
  input: anySchema as any,
  output: anySchema as any,
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

type LteProcedure = Procedure<LteInput, boolean, { description: string; tags: string[] }>;

const lteProcedure: LteProcedure = defineProcedure({
  path: ["lte"],
  input: anySchema as any,
  output: anySchema as any,
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
  inclusive?: boolean;
}

type BetweenProcedure = Procedure<BetweenInput, boolean, { description: string; tags: string[] }>;

const betweenProcedure: BetweenProcedure = defineProcedure({
  path: ["between"],
  input: anySchema as any,
  output: anySchema as any,
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
