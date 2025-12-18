/**
 * Comparison Procedures
 *
 * Equality and relational comparison operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.eq, client.gt).
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
const eqProcedure = defineProcedure({
    path: ["eq"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Strict equality (===)",
        tags: ["core", "comparison"],
    },
    handler: async (input) => {
        return input.a === input.b;
    },
});
const neqProcedure = defineProcedure({
    path: ["neq"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Strict inequality (!==)",
        tags: ["core", "comparison"],
    },
    handler: async (input) => {
        return input.a !== input.b;
    },
});
const gtProcedure = defineProcedure({
    path: ["gt"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Greater than (a > b)",
        tags: ["core", "comparison"],
    },
    handler: async (input) => {
        return input.a > input.b;
    },
});
const gteProcedure = defineProcedure({
    path: ["gte"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Greater than or equal (a >= b)",
        tags: ["core", "comparison"],
    },
    handler: async (input) => {
        return input.a >= input.b;
    },
});
const ltProcedure = defineProcedure({
    path: ["lt"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Less than (a < b)",
        tags: ["core", "comparison"],
    },
    handler: async (input) => {
        return input.a < input.b;
    },
});
const lteProcedure = defineProcedure({
    path: ["lte"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Less than or equal (a <= b)",
        tags: ["core", "comparison"],
    },
    handler: async (input) => {
        return input.a <= input.b;
    },
});
const betweenProcedure = defineProcedure({
    path: ["between"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if value is between min and max (inclusive by default)",
        tags: ["core", "comparison"],
    },
    handler: async (input) => {
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
const comparisonProceduresRaw = [
    eqProcedure,
    neqProcedure,
    gtProcedure,
    gteProcedure,
    ltProcedure,
    lteProcedure,
    betweenProcedure,
];
/**
 * All comparison procedures namespaced under "client".
 */
export const comparisonProcedures = namespace(["client"], comparisonProceduresRaw);
/**
 * Comparison procedures module for registration.
 */
export const comparisonModule = {
    name: "client-comparison",
    procedures: comparisonProcedures,
};
// Re-export individual procedures for direct access
export { eqProcedure, neqProcedure, gtProcedure, gteProcedure, ltProcedure, lteProcedure, betweenProcedure, };
//# sourceMappingURL=comparison.js.map