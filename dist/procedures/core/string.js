/**
 * String Procedures
 *
 * String manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.concat, client.split).
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
const concatProcedure = defineProcedure({
    path: ["concat"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Concatenate strings with optional separator",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.values.join(input.separator ?? "");
    },
});
const splitProcedure = defineProcedure({
    path: ["split"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Split string by separator",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.value.split(input.separator, input.limit);
    },
});
const joinProcedure = defineProcedure({
    path: ["join"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Join array of strings with separator",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.values.join(input.separator);
    },
});
const replaceProcedure = defineProcedure({
    path: ["replace"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Replace substring (first occurrence or all)",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        if (input.all) {
            return input.value.split(input.search).join(input.replace);
        }
        return input.value.replace(input.search, input.replace);
    },
});
const substringProcedure = defineProcedure({
    path: ["substring"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Extract substring from start to end index",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.value.substring(input.start, input.end);
    },
});
const trimProcedure = defineProcedure({
    path: ["trim"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Trim whitespace from string",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        const side = input.side ?? "both";
        switch (side) {
            case "start":
                return input.value.trimStart();
            case "end":
                return input.value.trimEnd();
            default:
                return input.value.trim();
        }
    },
});
const toLowerProcedure = defineProcedure({
    path: ["toLower"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Convert string to lowercase",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.value.toLowerCase();
    },
});
const toUpperProcedure = defineProcedure({
    path: ["toUpper"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Convert string to uppercase",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.value.toUpperCase();
    },
});
const startsWithProcedure = defineProcedure({
    path: ["startsWith"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if string starts with search string",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.value.startsWith(input.search);
    },
});
const endsWithProcedure = defineProcedure({
    path: ["endsWith"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if string ends with search string",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.value.endsWith(input.search);
    },
});
const includesProcedure = defineProcedure({
    path: ["includes"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if string contains search string",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.value.includes(input.search);
    },
});
const strLengthProcedure = defineProcedure({
    path: ["strLength"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get string length",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        return input.value.length;
    },
});
const templateProcedure = defineProcedure({
    path: ["template"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "String interpolation with {{key}} placeholders",
        tags: ["core", "string"],
    },
    handler: async (input) => {
        let result = input.template;
        for (const [key, value] of Object.entries(input.values)) {
            result = result.split(`{{${key}}}`).join(String(value));
        }
        return result;
    },
});
// =============================================================================
// Export String Procedures
// =============================================================================
/**
 * All string procedures (before namespacing).
 */
const stringProceduresRaw = [
    concatProcedure,
    splitProcedure,
    joinProcedure,
    replaceProcedure,
    substringProcedure,
    trimProcedure,
    toLowerProcedure,
    toUpperProcedure,
    startsWithProcedure,
    endsWithProcedure,
    includesProcedure,
    strLengthProcedure,
    templateProcedure,
];
/**
 * All string procedures namespaced under "client".
 */
export const stringProcedures = namespace(["client"], stringProceduresRaw);
/**
 * String procedures module for registration.
 */
export const stringModule = {
    name: "client-string",
    procedures: stringProcedures,
};
// Re-export individual procedures for direct access
export { concatProcedure, splitProcedure, joinProcedure, replaceProcedure, substringProcedure, trimProcedure, toLowerProcedure, toUpperProcedure, startsWithProcedure, endsWithProcedure, includesProcedure, strLengthProcedure, templateProcedure, };
//# sourceMappingURL=string.js.map