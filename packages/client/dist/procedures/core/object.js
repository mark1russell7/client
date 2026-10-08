/**
 * Object Procedures
 *
 * Object manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.get, client.set).
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
// =============================================================================
// Helper: Get nested value by path
// =============================================================================
function getByPath(obj, path) {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        current = current[part];
    }
    return current;
}
// =============================================================================
// Helper: Set nested value by path
// =============================================================================
function setByPath(obj, path, value) {
    const result = { ...obj };
    const parts = path.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
            current[part] = {};
        }
        else {
            current[part] = { ...current[part] };
        }
        current = current[part];
    }
    const lastPart = parts[parts.length - 1];
    if (lastPart !== undefined) {
        current[lastPart] = value;
    }
    return result;
}
const getProcedure = defineProcedure({
    path: ["get"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get nested value from object by dot-separated path",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        const value = getByPath(input.object, input.path);
        return value !== undefined ? value : input.default;
    },
});
const setProcedure = defineProcedure({
    path: ["set"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Set nested value in object by dot-separated path (immutable)",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        return setByPath(input.object, input.path, input.value);
    },
});
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (typeof source[key] === "object" &&
            source[key] !== null &&
            !Array.isArray(source[key]) &&
            typeof result[key] === "object" &&
            result[key] !== null &&
            !Array.isArray(result[key])) {
            result[key] = deepMerge(result[key], source[key]);
        }
        else {
            result[key] = source[key];
        }
    }
    return result;
}
const mergeProcedure = defineProcedure({
    path: ["merge"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Merge multiple objects (shallow or deep)",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        if (input.deep) {
            return input.objects.reduce((acc, obj) => deepMerge(acc, obj), {});
        }
        return Object.assign({}, ...input.objects);
    },
});
const keysProcedure = defineProcedure({
    path: ["keys"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get array of object keys",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        return Object.keys(input.object);
    },
});
const valuesProcedure = defineProcedure({
    path: ["values"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get array of object values",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        return Object.values(input.object);
    },
});
const entriesProcedure = defineProcedure({
    path: ["entries"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get array of [key, value] pairs",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        return Object.entries(input.object);
    },
});
const fromEntriesProcedure = defineProcedure({
    path: ["fromEntries"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Create object from [key, value] pairs",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        return Object.fromEntries(input.entries);
    },
});
const pickProcedure = defineProcedure({
    path: ["pick"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Pick specified keys from object",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        const result = {};
        for (const key of input.keys) {
            if (key in input.object) {
                result[key] = input.object[key];
            }
        }
        return result;
    },
});
const omitProcedure = defineProcedure({
    path: ["omit"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Omit specified keys from object",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        const keysToOmit = new Set(input.keys);
        const result = {};
        for (const key of Object.keys(input.object)) {
            if (!keysToOmit.has(key)) {
                result[key] = input.object[key];
            }
        }
        return result;
    },
});
const hasProcedure = defineProcedure({
    path: ["has"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if object has a value at the specified path",
        tags: ["core", "object"],
    },
    handler: async (input) => {
        return getByPath(input.object, input.path) !== undefined;
    },
});
// =============================================================================
// Export Object Procedures
// =============================================================================
/**
 * All object procedures (before namespacing).
 */
const objectProceduresRaw = [
    getProcedure,
    setProcedure,
    mergeProcedure,
    keysProcedure,
    valuesProcedure,
    entriesProcedure,
    fromEntriesProcedure,
    pickProcedure,
    omitProcedure,
    hasProcedure,
];
/**
 * All object procedures namespaced under "client".
 */
export const objectProcedures = namespace(["client"], objectProceduresRaw);
/**
 * Object procedures module for registration.
 */
export const objectModule = {
    name: "client-object",
    procedures: objectProcedures,
};
// Re-export individual procedures for direct access
export { getProcedure, setProcedure, mergeProcedure, keysProcedure, valuesProcedure, entriesProcedure, fromEntriesProcedure, pickProcedure, omitProcedure, hasProcedure, };
//# sourceMappingURL=object.js.map