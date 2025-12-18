/**
 * Type Procedures
 *
 * Type checking and coercion operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.typeof, client.isArray).
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
// Typeof Procedure
// =============================================================================

interface TypeofInput {
  value: unknown;
}

type TypeofProcedure = Procedure<TypeofInput, string, { description: string; tags: string[] }>;

const typeofProcedure: TypeofProcedure = defineProcedure({
  path: ["typeof"],
  input: anySchema as any,
  output: anySchema as any,
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
  value: unknown;
}

type IsNullProcedure = Procedure<IsNullInput, boolean, { description: string; tags: string[] }>;

const isNullProcedure: IsNullProcedure = defineProcedure({
  path: ["isNull"],
  input: anySchema as any,
  output: anySchema as any,
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
  value: unknown;
}

type IsUndefinedProcedure = Procedure<IsUndefinedInput, boolean, { description: string; tags: string[] }>;

const isUndefinedProcedure: IsUndefinedProcedure = defineProcedure({
  path: ["isUndefined"],
  input: anySchema as any,
  output: anySchema as any,
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
  value: unknown;
}

type IsNilProcedure = Procedure<IsNilInput, boolean, { description: string; tags: string[] }>;

const isNilProcedure: IsNilProcedure = defineProcedure({
  path: ["isNil"],
  input: anySchema as any,
  output: anySchema as any,
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
  value: unknown;
}

type IsArrayProcedure = Procedure<IsArrayInput, boolean, { description: string; tags: string[] }>;

const isArrayProcedure: IsArrayProcedure = defineProcedure({
  path: ["isArray"],
  input: anySchema as any,
  output: anySchema as any,
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
  value: unknown;
}

type IsObjectProcedure = Procedure<IsObjectInput, boolean, { description: string; tags: string[] }>;

const isObjectProcedure: IsObjectProcedure = defineProcedure({
  path: ["isObject"],
  input: anySchema as any,
  output: anySchema as any,
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
  value: unknown;
}

type IsStringProcedure = Procedure<IsStringInput, boolean, { description: string; tags: string[] }>;

const isStringProcedure: IsStringProcedure = defineProcedure({
  path: ["isString"],
  input: anySchema as any,
  output: anySchema as any,
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
  value: unknown;
}

type IsNumberProcedure = Procedure<IsNumberInput, boolean, { description: string; tags: string[] }>;

const isNumberProcedure: IsNumberProcedure = defineProcedure({
  path: ["isNumber"],
  input: anySchema as any,
  output: anySchema as any,
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
  value: unknown;
}

type IsBooleanProcedure = Procedure<IsBooleanInput, boolean, { description: string; tags: string[] }>;

const isBooleanProcedure: IsBooleanProcedure = defineProcedure({
  path: ["isBoolean"],
  input: anySchema as any,
  output: anySchema as any,
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
  value: unknown;
  to: "string" | "number" | "boolean" | "array";
}

type CoerceProcedure = Procedure<CoerceInput, unknown, { description: string; tags: string[] }>;

const coerceProcedure: CoerceProcedure = defineProcedure({
  path: ["coerce"],
  input: anySchema as any,
  output: anySchema as any,
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
export const typeProcedures: AnyProcedure[] = namespace(["client"], typeProceduresRaw);

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
