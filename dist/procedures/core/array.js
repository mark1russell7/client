/**
 * Array Procedures
 *
 * Array manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.first, client.filter).
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
const firstProcedure = defineProcedure({
    path: ["first"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get first element of array",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return input.items[0];
    },
});
const lastProcedure = defineProcedure({
    path: ["last"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get last element of array",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return input.items[input.items.length - 1];
    },
});
const nthProcedure = defineProcedure({
    path: ["nth"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get element at index (supports negative indexing)",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        const index = input.index < 0 ? input.items.length + input.index : input.index;
        return input.items[index];
    },
});
const arrLengthProcedure = defineProcedure({
    path: ["arrLength"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get array length",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return input.items.length;
    },
});
const flattenProcedure = defineProcedure({
    path: ["flatten"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Flatten nested arrays to specified depth",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return input.items.flat(input.depth ?? 1);
    },
});
const reverseProcedure = defineProcedure({
    path: ["reverse"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Reverse array order",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return [...input.items].reverse();
    },
});
const sortProcedure = defineProcedure({
    path: ["sort"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Sort array (optionally by key, optionally descending)",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        const items = [...input.items];
        const direction = input.desc ? -1 : 1;
        return items.sort((a, b) => {
            let aVal = input.key ? a[input.key] : a;
            let bVal = input.key ? b[input.key] : b;
            if (typeof aVal === "string" && typeof bVal === "string") {
                return aVal.localeCompare(bVal) * direction;
            }
            if (typeof aVal === "number" && typeof bVal === "number") {
                return (aVal - bVal) * direction;
            }
            return 0;
        });
    },
});
const sliceProcedure = defineProcedure({
    path: ["slice"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Extract portion of array",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return input.items.slice(input.start, input.end);
    },
});
const arrConcatProcedure = defineProcedure({
    path: ["arrConcat"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Concatenate multiple arrays",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return [].concat(...input.arrays);
    },
});
const uniqueProcedure = defineProcedure({
    path: ["unique"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Remove duplicate values (optionally by key)",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        if (input.key) {
            const seen = new Set();
            return input.items.filter((item) => {
                const val = item[input.key];
                if (seen.has(val))
                    return false;
                seen.add(val);
                return true;
            });
        }
        return [...new Set(input.items)];
    },
});
const groupByProcedure = defineProcedure({
    path: ["groupBy"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Group array items by key value",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        const result = {};
        for (const item of input.items) {
            const keyVal = String(item[input.key]);
            if (!result[keyVal]) {
                result[keyVal] = [];
            }
            result[keyVal].push(item);
        }
        return result;
    },
});
const zipProcedure = defineProcedure({
    path: ["zip"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Zip multiple arrays into array of tuples",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        if (input.arrays.length === 0)
            return [];
        const maxLen = Math.max(...input.arrays.map((a) => a.length));
        const result = [];
        for (let i = 0; i < maxLen; i++) {
            result.push(input.arrays.map((a) => a[i]));
        }
        return result;
    },
});
const unzipProcedure = defineProcedure({
    path: ["unzip"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Unzip array of tuples into multiple arrays",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        if (input.tuples.length === 0)
            return [];
        const numArrays = input.tuples[0]?.length ?? 0;
        const result = Array.from({ length: numArrays }, () => []);
        for (const tuple of input.tuples) {
            for (let i = 0; i < numArrays; i++) {
                result[i].push(tuple[i]);
            }
        }
        return result;
    },
});
const indexOfProcedure = defineProcedure({
    path: ["indexOf"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Find index of value in array (-1 if not found)",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return input.items.indexOf(input.value, input.fromIndex);
    },
});
const containsProcedure = defineProcedure({
    path: ["contains"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Check if array contains value",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return input.items.includes(input.value);
    },
});
const pushProcedure = defineProcedure({
    path: ["push"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Add value to end of array (immutable)",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return [...input.items, input.value];
    },
});
const unshiftProcedure = defineProcedure({
    path: ["unshift"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Add value to beginning of array (immutable)",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        return [input.value, ...input.items];
    },
});
const rangeProcedure = defineProcedure({
    path: ["range"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Generate array of numbers from start to end (exclusive)",
        tags: ["core", "array"],
    },
    handler: async (input) => {
        const step = input.step ?? 1;
        const result = [];
        if (step > 0) {
            for (let i = input.start; i < input.end; i += step) {
                result.push(i);
            }
        }
        else if (step < 0) {
            for (let i = input.start; i > input.end; i += step) {
                result.push(i);
            }
        }
        return result;
    },
});
const filterProcedure = defineProcedure({
    path: ["filter"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Filter array by property value or predicate",
        tags: ["core", "array", "filter"],
    },
    handler: async (input) => {
        const { items, key, value, values, match = 'equals', invert = false } = input;
        const predicate = (item) => {
            const itemValue = key ? item[key] : item;
            let result;
            switch (match) {
                case 'equals':
                    result = itemValue === value;
                    break;
                case 'not':
                    result = itemValue !== value;
                    break;
                case 'in':
                    result = (values ?? []).includes(itemValue);
                    break;
                case 'notIn':
                    result = !(values ?? []).includes(itemValue);
                    break;
                case 'contains':
                    result = typeof itemValue === 'string' && typeof value === 'string' && itemValue.includes(value);
                    break;
                case 'startsWith':
                    result = typeof itemValue === 'string' && typeof value === 'string' && itemValue.startsWith(value);
                    break;
                case 'endsWith':
                    result = typeof itemValue === 'string' && typeof value === 'string' && itemValue.endsWith(value);
                    break;
                case 'gt':
                    result = typeof itemValue === 'number' && typeof value === 'number' && itemValue > value;
                    break;
                case 'gte':
                    result = typeof itemValue === 'number' && typeof value === 'number' && itemValue >= value;
                    break;
                case 'lt':
                    result = typeof itemValue === 'number' && typeof value === 'number' && itemValue < value;
                    break;
                case 'lte':
                    result = typeof itemValue === 'number' && typeof value === 'number' && itemValue <= value;
                    break;
                default:
                    result = Boolean(itemValue);
            }
            return invert ? !result : result;
        };
        return items.filter(predicate);
    },
});
const whereProcedure = defineProcedure({
    path: ["where"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Filter array where all key-value pairs match",
        tags: ["core", "array", "filter"],
    },
    handler: async (input) => {
        const { items, where } = input;
        return items.filter((item) => {
            const obj = item;
            return Object.entries(where).every(([key, value]) => obj[key] === value);
        });
    },
});
const pluckProcedure = defineProcedure({
    path: ["pluck"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Extract single property from all items",
        tags: ["core", "array", "transform"],
    },
    handler: async (input) => {
        return input.items.map((item) => item[input.key]);
    },
});
const arrPickProcedure = defineProcedure({
    path: ["arrPick"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Keep only specified properties from all items",
        tags: ["core", "array", "transform"],
    },
    handler: async (input) => {
        return input.items.map((item) => {
            const obj = item;
            const result = {};
            for (const key of input.keys) {
                if (key in obj) {
                    result[key] = obj[key];
                }
            }
            return result;
        });
    },
});
const arrOmitProcedure = defineProcedure({
    path: ["arrOmit"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Remove specified properties from all array items",
        tags: ["core", "array", "transform"],
    },
    handler: async (input) => {
        const keysToOmit = new Set(input.keys);
        return input.items.map((item) => {
            const obj = item;
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                if (!keysToOmit.has(key)) {
                    result[key] = value;
                }
            }
            return result;
        });
    },
});
const partitionProcedure = defineProcedure({
    path: ["partition"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Split array into two arrays based on predicate",
        tags: ["core", "array", "filter"],
    },
    handler: async (input) => {
        const truthy = [];
        const falsy = [];
        for (const item of input.items) {
            const itemValue = item[input.key];
            const matches = input.value !== undefined ? itemValue === input.value : Boolean(itemValue);
            if (matches) {
                truthy.push(item);
            }
            else {
                falsy.push(item);
            }
        }
        return { truthy, falsy };
    },
});
const countProcedure = defineProcedure({
    path: ["count"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Count items matching criteria (or total if no criteria)",
        tags: ["core", "array", "filter"],
    },
    handler: async (input) => {
        if (!input.key) {
            return input.items.length;
        }
        return input.items.filter((item) => {
            const itemValue = item[input.key];
            return input.value !== undefined ? itemValue === input.value : Boolean(itemValue);
        }).length;
    },
});
// =============================================================================
// Export Array Procedures
// =============================================================================
/**
 * All array procedures (before namespacing).
 */
const arrayProceduresRaw = [
    // Access
    firstProcedure,
    lastProcedure,
    nthProcedure,
    arrLengthProcedure,
    // Transform
    flattenProcedure,
    reverseProcedure,
    sortProcedure,
    sliceProcedure,
    arrConcatProcedure,
    uniqueProcedure,
    groupByProcedure,
    zipProcedure,
    unzipProcedure,
    // Search
    indexOfProcedure,
    containsProcedure,
    // Mutation (immutable)
    pushProcedure,
    unshiftProcedure,
    // Generation
    rangeProcedure,
    // Filtering (Core Logic + Filtering Separation)
    filterProcedure,
    whereProcedure,
    pluckProcedure,
    arrPickProcedure,
    arrOmitProcedure,
    partitionProcedure,
    countProcedure,
];
/**
 * All array procedures namespaced under "client".
 */
export const arrayProcedures = namespace(["client"], arrayProceduresRaw);
/**
 * Array procedures module for registration.
 */
export const arrayModule = {
    name: "client-array",
    procedures: arrayProcedures,
};
// Re-export individual procedures for direct access
export { 
// Access
firstProcedure, lastProcedure, nthProcedure, arrLengthProcedure, 
// Transform
flattenProcedure, reverseProcedure, sortProcedure, sliceProcedure, arrConcatProcedure, uniqueProcedure, groupByProcedure, zipProcedure, unzipProcedure, 
// Search
indexOfProcedure, containsProcedure, 
// Mutation (immutable)
pushProcedure, unshiftProcedure, 
// Generation
rangeProcedure, 
// Filtering (Core Logic + Filtering Separation)
filterProcedure, whereProcedure, pluckProcedure, arrPickProcedure, arrOmitProcedure, partitionProcedure, countProcedure, };
//# sourceMappingURL=array.js.map