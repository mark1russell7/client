/**
 * Type Procedures
 *
 * Type checking and coercion operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.typeof, client.isArray).
 */
import { defineProcedure, namespace } from "../define.js";
// =============================================================================
// Type-safe passthrough schema
// =============================================================================
const anySchema = {
    parse: (data) => data,
    safeParse: (data) => ({ success: true, data }),
    _output: undefined,
};
const typeofProcedure = defineProcedure({
    path: ["typeof"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get type of value (string, number, boolean, object, array, null, undefined, function)",
        tags: ["core", "type"],
    },
    handler: async (input) => {
        const value = input.value;
        if (value === null)
            return "null";
        if (Array.isArray(value))
            return "array";
        return typeof value;
    },
});
const isNullProcedure = defineProcedure({
    path: ["isNull"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if value is null",
        tags: ["core", "type"],
    },
    handler: async (input) => {
        return input.value === null;
    },
});
const isUndefinedProcedure = defineProcedure({
    path: ["isUndefined"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if value is undefined",
        tags: ["core", "type"],
    },
    handler: async (input) => {
        return input.value === undefined;
    },
});
const isNilProcedure = defineProcedure({
    path: ["isNil"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if value is null or undefined",
        tags: ["core", "type"],
    },
    handler: async (input) => {
        return input.value === null || input.value === undefined;
    },
});
const isArrayProcedure = defineProcedure({
    path: ["isArray"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if value is an array",
        tags: ["core", "type"],
    },
    handler: async (input) => {
        return Array.isArray(input.value);
    },
});
const isObjectProcedure = defineProcedure({
    path: ["isObject"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if value is a plain object (not array, not null)",
        tags: ["core", "type"],
    },
    handler: async (input) => {
        return typeof input.value === "object" && input.value !== null && !Array.isArray(input.value);
    },
});
const isStringProcedure = defineProcedure({
    path: ["isString"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if value is a string",
        tags: ["core", "type"],
    },
    handler: async (input) => {
        return typeof input.value === "string";
    },
});
const isNumberProcedure = defineProcedure({
    path: ["isNumber"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if value is a number (not NaN)",
        tags: ["core", "type"],
    },
    handler: async (input) => {
        return typeof input.value === "number" && !Number.isNaN(input.value);
    },
});
const isBooleanProcedure = defineProcedure({
    path: ["isBoolean"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if value is a boolean",
        tags: ["core", "type"],
    },
    handler: async (input) => {
        return typeof input.value === "boolean";
    },
});
const coerceProcedure = defineProcedure({
    path: ["coerce"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Coerce value to specified type",
        tags: ["core", "type"],
    },
    handler: async (input) => {
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
const typeProceduresRaw = [
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
];
/**
 * All type procedures namespaced under "client".
 */
export const typeProcedures = namespace(["client"], typeProceduresRaw);
/**
 * Type procedures module for registration.
 */
export const typeModule = {
    name: "client-type",
    procedures: typeProcedures,
};
// Re-export individual procedures for direct access
export { typeofProcedure, isNullProcedure, isUndefinedProcedure, isNilProcedure, isArrayProcedure, isObjectProcedure, isStringProcedure, isNumberProcedure, isBooleanProcedure, coerceProcedure, };
//# sourceMappingURL=type.js.map