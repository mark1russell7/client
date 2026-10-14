/**
 * Type Procedures
 *
 * Type checking and coercion operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.typeof, client.isArray).
 */

import { z } from "zod";
import { anyOutput, booleanOutput, stringOutput } from "./outputs.js";
import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure } from "../types.js";
import { PURE_EFFECTS, withEffects } from "../effects.js";

// =============================================================================
// Typeof Procedure
// =============================================================================

interface TypeofInput {
  value?: unknown;
}

const TypeofInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
});

type TypeofProcedure = Procedure<TypeofInput, string, { description: string; tags: string[] }>;

const typeofProcedure: TypeofProcedure = defineProcedure({
  path: ["typeof"],
  input: TypeofInputSchema,
  output: stringOutput("The type name of the value"),
  metadata: {
    description: "Get type of value (string, number, boolean, object, array, null, undefined, function)",
    tags: ["core", "type"],
  },
  handler: async (input: TypeofInput): Promise<string> => {
    const value = input.value;
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  },
});

// =============================================================================
// IsNull Procedure
// =============================================================================

interface IsNullInput {
  value?: unknown;
}

const IsNullInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
});

type IsNullProcedure = Procedure<IsNullInput, boolean, { description: string; tags: string[] }>;

const isNullProcedure: IsNullProcedure = defineProcedure({
  path: ["isNull"],
  input: IsNullInputSchema,
  output: booleanOutput("True for null"),
  metadata: {
    description: "Check if value is null",
    tags: ["core", "type"],
  },
  handler: async (input: IsNullInput): Promise<boolean> => {
    return input.value === null;
  },
});

// =============================================================================
// IsUndefined Procedure
// =============================================================================

interface IsUndefinedInput {
  value?: unknown;
}

const IsUndefinedInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
});

type IsUndefinedProcedure = Procedure<IsUndefinedInput, boolean, { description: string; tags: string[] }>;

const isUndefinedProcedure: IsUndefinedProcedure = defineProcedure({
  path: ["isUndefined"],
  input: IsUndefinedInputSchema,
  output: booleanOutput("True for undefined"),
  metadata: {
    description: "Check if value is undefined",
    tags: ["core", "type"],
  },
  handler: async (input: IsUndefinedInput): Promise<boolean> => {
    return input.value === undefined;
  },
});

// =============================================================================
// IsNil Procedure
// =============================================================================

interface IsNilInput {
  value?: unknown;
}

const IsNilInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
});

type IsNilProcedure = Procedure<IsNilInput, boolean, { description: string; tags: string[] }>;

const isNilProcedure: IsNilProcedure = defineProcedure({
  path: ["isNil"],
  input: IsNilInputSchema,
  output: booleanOutput("True for null or undefined"),
  metadata: {
    description: "Check if value is null or undefined",
    tags: ["core", "type"],
  },
  handler: async (input: IsNilInput): Promise<boolean> => {
    return input.value === null || input.value === undefined;
  },
});

// =============================================================================
// IsArray Procedure
// =============================================================================

interface IsArrayInput {
  value?: unknown;
}

const IsArrayInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
});

type IsArrayProcedure = Procedure<IsArrayInput, boolean, { description: string; tags: string[] }>;

const isArrayProcedure: IsArrayProcedure = defineProcedure({
  path: ["isArray"],
  input: IsArrayInputSchema,
  output: booleanOutput("True for an array"),
  metadata: {
    description: "Check if value is an array",
    tags: ["core", "type"],
  },
  handler: async (input: IsArrayInput): Promise<boolean> => {
    return Array.isArray(input.value);
  },
});

// =============================================================================
// IsObject Procedure
// =============================================================================

interface IsObjectInput {
  value?: unknown;
}

const IsObjectInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
});

type IsObjectProcedure = Procedure<IsObjectInput, boolean, { description: string; tags: string[] }>;

const isObjectProcedure: IsObjectProcedure = defineProcedure({
  path: ["isObject"],
  input: IsObjectInputSchema,
  output: booleanOutput("True for a plain object"),
  metadata: {
    description: "Check if value is a plain object (not array, not null)",
    tags: ["core", "type"],
  },
  handler: async (input: IsObjectInput): Promise<boolean> => {
    return typeof input.value === "object" && input.value !== null && !Array.isArray(input.value);
  },
});

// =============================================================================
// IsString Procedure
// =============================================================================

interface IsStringInput {
  value?: unknown;
}

const IsStringInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
});

type IsStringProcedure = Procedure<IsStringInput, boolean, { description: string; tags: string[] }>;

const isStringProcedure: IsStringProcedure = defineProcedure({
  path: ["isString"],
  input: IsStringInputSchema,
  output: booleanOutput("True for a string"),
  metadata: {
    description: "Check if value is a string",
    tags: ["core", "type"],
  },
  handler: async (input: IsStringInput): Promise<boolean> => {
    return typeof input.value === "string";
  },
});

// =============================================================================
// IsNumber Procedure
// =============================================================================

interface IsNumberInput {
  value?: unknown;
}

const IsNumberInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
});

type IsNumberProcedure = Procedure<IsNumberInput, boolean, { description: string; tags: string[] }>;

const isNumberProcedure: IsNumberProcedure = defineProcedure({
  path: ["isNumber"],
  input: IsNumberInputSchema,
  output: booleanOutput("True for a number"),
  metadata: {
    description: "Check if value is a number (not NaN)",
    tags: ["core", "type"],
  },
  handler: async (input: IsNumberInput): Promise<boolean> => {
    return typeof input.value === "number" && !Number.isNaN(input.value);
  },
});

// =============================================================================
// IsBoolean Procedure
// =============================================================================

interface IsBooleanInput {
  value?: unknown;
}

const IsBooleanInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
});

type IsBooleanProcedure = Procedure<IsBooleanInput, boolean, { description: string; tags: string[] }>;

const isBooleanProcedure: IsBooleanProcedure = defineProcedure({
  path: ["isBoolean"],
  input: IsBooleanInputSchema,
  output: booleanOutput("True for a boolean"),
  metadata: {
    description: "Check if value is a boolean",
    tags: ["core", "type"],
  },
  handler: async (input: IsBooleanInput): Promise<boolean> => {
    return typeof input.value === "boolean";
  },
});

// =============================================================================
// Coerce Procedure
// =============================================================================

interface CoerceInput {
  value?: unknown;
  to: "string" | "number" | "boolean" | "array";
}

const CoerceInputSchema = z.object({
  value: z.unknown().optional().describe("The value"),
  to: z.enum(["string", "number", "boolean", "array"]).describe("The type to convert to: string, number, boolean or array"),
});

type CoerceProcedure = Procedure<CoerceInput, unknown, { description: string; tags: string[] }>;

const coerceProcedure: CoerceProcedure = defineProcedure({
  path: ["coerce"],
  input: CoerceInputSchema,
  output: anyOutput("The value in the target type"),
  metadata: {
    description: "Coerce value to specified type",
    tags: ["core", "type"],
  },
  handler: async (input: CoerceInput): Promise<unknown> => {
    switch (input.to) {
      case "string":
        return String(input.value);
      case "number":
        return Number(input.value);
      case "boolean":
        return Boolean(input.value);
      case "array":
        return Array.isArray(input.value) ? input.value : [input.value];
      default:
        return input.value;
    }
  },
});

// =============================================================================
// Export Type Procedures
// =============================================================================

/**
 * All type procedures (before namespacing).
 */
const typeProceduresRaw: AnyProcedure[] = [
  typeofProcedure as AnyProcedure,
  isNullProcedure as AnyProcedure,
  isUndefinedProcedure as AnyProcedure,
  isNilProcedure as AnyProcedure,
  isArrayProcedure as AnyProcedure,
  isObjectProcedure as AnyProcedure,
  isStringProcedure as AnyProcedure,
  isNumberProcedure as AnyProcedure,
  isBooleanProcedure as AnyProcedure,
  coerceProcedure as AnyProcedure,
];

/**
 * All type procedures namespaced under "client".
 */
// Each one calculates its output from its input: no reads, no changes (CAPABILITIES-2026-10)
export const typeProcedures: AnyProcedure[] = namespace(["client"], withEffects(PURE_EFFECTS, typeProceduresRaw));

/**
 * Type procedures module for registration.
 */
export const typeModule: { name: string; procedures: AnyProcedure[] } = {
  name: "client-type",
  procedures: typeProcedures,
};

// Re-export individual procedures for direct access
export {
  typeofProcedure,
  isNullProcedure,
  isUndefinedProcedure,
  isNilProcedure,
  isArrayProcedure,
  isObjectProcedure,
  isStringProcedure,
  isNumberProcedure,
  isBooleanProcedure,
  coerceProcedure,
};
