/**
 * Math Procedures
 *
 * Arithmetic and mathematical operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.add, client.multiply).
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
const addProcedure = defineProcedure({
    path: ["add"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Add two numbers",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return input.a + input.b;
    },
});
const subtractProcedure = defineProcedure({
    path: ["subtract"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Subtract b from a",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return input.a - input.b;
    },
});
const multiplyProcedure = defineProcedure({
    path: ["multiply"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Multiply two numbers",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return input.a * input.b;
    },
});
const divideProcedure = defineProcedure({
    path: ["divide"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Divide a by b",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        if (input.b === 0) {
            throw new Error("Division by zero");
        }
        return input.a / input.b;
    },
});
const modProcedure = defineProcedure({
    path: ["mod"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Modulo (remainder of a / b)",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return input.a % input.b;
    },
});
const absProcedure = defineProcedure({
    path: ["abs"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Absolute value",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return Math.abs(input.value);
    },
});
const minProcedure = defineProcedure({
    path: ["min"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Minimum value from array",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        if (input.values.length === 0) {
            return Infinity;
        }
        return Math.min(...input.values);
    },
});
const maxProcedure = defineProcedure({
    path: ["max"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Maximum value from array",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        if (input.values.length === 0) {
            return -Infinity;
        }
        return Math.max(...input.values);
    },
});
const sumProcedure = defineProcedure({
    path: ["sum"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Sum of all values in array",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return input.values.reduce((acc, val) => acc + val, 0);
    },
});
const powProcedure = defineProcedure({
    path: ["pow"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Raise base to exponent power",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return Math.pow(input.base, input.exp);
    },
});
const sqrtProcedure = defineProcedure({
    path: ["sqrt"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Square root",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return Math.sqrt(input.value);
    },
});
const floorProcedure = defineProcedure({
    path: ["floor"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Round down to nearest integer",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return Math.floor(input.value);
    },
});
const ceilProcedure = defineProcedure({
    path: ["ceil"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Round up to nearest integer",
        tags: ["core", "math"],
    },
    handler: async (input) => {
        return Math.ceil(input.value);
    },
});
const roundProcedure = defineProcedure({
    path: ["round"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Round to nearest integer or specified decimal places",
        tags: ["core", "math"],
    },
    handler: async (input) => {
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
const mathProceduresRaw = [
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
];
/**
 * All math procedures namespaced under "client".
 */
export const mathProcedures = namespace(["client"], mathProceduresRaw);
/**
 * Math procedures module for registration.
 */
export const mathModule = {
    name: "client-math",
    procedures: mathProcedures,
};
// Re-export individual procedures for direct access
export { addProcedure, subtractProcedure, multiplyProcedure, divideProcedure, modProcedure, absProcedure, minProcedure, maxProcedure, sumProcedure, powProcedure, sqrtProcedure, floorProcedure, ceilProcedure, roundProcedure, };
//# sourceMappingURL=math.js.map