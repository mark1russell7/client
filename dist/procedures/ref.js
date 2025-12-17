/**
 * Procedure Reference System
 *
 * Enables procedures-as-data: procedures can be passed as inputs to other procedures,
 * composed declaratively via JSON, or imperatively via TypeScript.
 *
 * Key concepts:
 * - PROCEDURE_SYMBOL: Symbol tag to identify procedure references in JSON/objects
 * - ProcedureRef: A reference to a procedure with pre-bound input
 * - hydrateInput: Walks input tree and executes nested procedure references
 * - proc(): Factory function to create procedure references
 *
 * @example
 * ```typescript
 * // Imperative (TypeScript)
 * const pipeline = proc(["dag", "traverse"])
 *   .input({
 *     visit: proc(["client", "chain"]).input({
 *       steps: [
 *         proc(["git", "add"]).input({ all: true }),
 *         proc(["git", "commit"]).input({ message: "auto" }),
 *         proc(["git", "push"]).input({}),
 *       ],
 *     }),
 *   });
 *
 * // Declarative (JSON) - equivalent
 * const pipelineJson = {
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: {
 *       $proc: ["client", "chain"],
 *       input: {
 *         steps: [
 *           { $proc: ["git", "add"], input: { all: true } },
 *           { $proc: ["git", "commit"], input: { message: "auto" } },
 *           { $proc: ["git", "push"], input: {} },
 *         ],
 *       },
 *     },
 *   },
 * };
 *
 * // Both can be called via client.call()
 * await client.call(pipeline);
 * await client.call(pipelineJson);
 * ```
 */
// =============================================================================
// Procedure Reference Symbol
// =============================================================================
/**
 * Symbol used to tag objects as procedure references.
 * This allows procedure references to be identified during input hydration.
 */
export const PROCEDURE_SYMBOL = Symbol.for("@mark/procedure");
/**
 * JSON key used to identify procedure references in serialized form.
 * When parsing JSON, objects with this key are treated as procedure refs.
 */
export const PROCEDURE_JSON_KEY = "$proc";
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if a value is a procedure reference (runtime form with Symbol).
 */
export function isProcedureRef(value) {
    return (typeof value === "object" &&
        value !== null &&
        PROCEDURE_SYMBOL in value &&
        value[PROCEDURE_SYMBOL] === true);
}
/**
 * Check if a value is a JSON procedure reference (serialized form with $proc key).
 */
export function isProcedureRefJson(value) {
    return (typeof value === "object" &&
        value !== null &&
        PROCEDURE_JSON_KEY in value &&
        Array.isArray(value[PROCEDURE_JSON_KEY]));
}
/**
 * Check if a value is any form of procedure reference.
 */
export function isAnyProcedureRef(value) {
    return isProcedureRef(value) || isProcedureRefJson(value);
}
// =============================================================================
// Procedure Reference Builder
// =============================================================================
/**
 * Builder for creating procedure references with a fluent API.
 */
export class ProcedureRefBuilder {
    _path;
    _input = {};
    constructor(path) {
        this._path = path;
    }
    /**
     * Set the input for this procedure reference.
     */
    input(input) {
        const builder = this;
        builder._input = input;
        return builder;
    }
    /**
     * Build the procedure reference object.
     */
    build() {
        return {
            [PROCEDURE_SYMBOL]: true,
            path: this._path,
            input: this._input,
        };
    }
    /**
     * Convert to JSON-serializable form.
     */
    toJson() {
        return {
            $proc: this._path,
            input: this._input,
        };
    }
    /**
     * Alias for build() - makes the builder callable in expression contexts.
     */
    get ref() {
        return this.build();
    }
}
/**
 * Create a procedure reference.
 *
 * @param path - Path to the procedure
 * @returns Builder for the procedure reference
 *
 * @example
 * ```typescript
 * // Simple reference
 * const addRef = proc(["git", "add"]).input({ all: true }).build();
 *
 * // Nested references (procedures as inputs)
 * const pipeline = proc(["client", "chain"]).input({
 *   steps: [
 *     proc(["git", "add"]).input({ all: true }).ref,
 *     proc(["git", "commit"]).input({ message: "auto" }).ref,
 *   ],
 * }).build();
 * ```
 */
export function proc(path) {
    return new ProcedureRefBuilder(path);
}
// =============================================================================
// JSON Conversion
// =============================================================================
/**
 * Convert a procedure reference from JSON form to runtime form.
 */
export function fromJson(json) {
    return {
        [PROCEDURE_SYMBOL]: true,
        path: json.$proc,
        input: json.input,
    };
}
/**
 * Convert a procedure reference from runtime form to JSON form.
 */
export function toJson(ref) {
    return {
        $proc: ref.path,
        input: ref.input,
    };
}
/**
 * Normalize any procedure reference to runtime form.
 */
export function normalizeRef(ref) {
    if (isProcedureRef(ref)) {
        return ref;
    }
    return fromJson(ref);
}
/**
 * Hydrate an input tree by executing any nested procedure references.
 *
 * Walks the input object tree and replaces any ProcedureRef or ProcedureRefJson
 * objects with the result of executing that procedure.
 *
 * @param input - The input object potentially containing procedure references
 * @param executor - Function to execute procedure references
 * @param options - Hydration options
 * @returns The hydrated input with all procedure refs replaced by their results
 *
 * @example
 * ```typescript
 * const input = {
 *   visit: proc(["git", "add"]).input({ all: true }).build(),
 *   config: { nested: true },
 * };
 *
 * const hydrated = await hydrateInput(input, async (path, input) => {
 *   return await client.call({ path, input });
 * });
 *
 * // hydrated.visit is now the result of executing git.add
 * ```
 */
export async function hydrateInput(input, executor, options = {}) {
    const { maxDepth = 10 } = options;
    return hydrateValue(input, executor, 0, maxDepth);
}
/**
 * Internal recursive hydration function.
 */
async function hydrateValue(value, executor, depth, maxDepth) {
    // Depth check
    if (depth > maxDepth) {
        throw new Error(`Hydration depth exceeded maximum of ${maxDepth}`);
    }
    // Handle null/undefined/primitives
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value !== "object") {
        return value;
    }
    // Check if this is a procedure reference
    if (isAnyProcedureRef(value)) {
        const ref = normalizeRef(value);
        // First, hydrate the input of the procedure reference itself
        const hydratedInput = await hydrateValue(ref.input, executor, depth + 1, maxDepth);
        // Then execute the procedure with hydrated input
        const result = await executor(ref.path, hydratedInput);
        return result;
    }
    // Handle arrays
    if (Array.isArray(value)) {
        const hydrated = await Promise.all(value.map((item) => hydrateValue(item, executor, depth + 1, maxDepth)));
        return hydrated;
    }
    // Handle plain objects
    const obj = value;
    const entries = Object.entries(obj);
    const hydratedEntries = await Promise.all(entries.map(async ([key, val]) => {
        const hydratedVal = await hydrateValue(val, executor, depth + 1, maxDepth);
        return [key, hydratedVal];
    }));
    return Object.fromEntries(hydratedEntries);
}
// =============================================================================
// Template Extraction
// =============================================================================
/**
 * Extract a JSON template from a procedure reference.
 * Useful for serializing imperative procedure compositions.
 *
 * @param ref - Procedure reference to extract template from
 * @returns JSON-serializable template
 */
export function extractTemplate(ref) {
    return extractTemplateValue(ref);
}
/**
 * Internal recursive template extraction.
 */
function extractTemplateValue(value) {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value !== "object") {
        return value;
    }
    // Convert procedure refs to JSON form
    if (isProcedureRef(value)) {
        return {
            $proc: value.path,
            input: extractTemplateValue(value.input),
        };
    }
    // Already JSON form
    if (isProcedureRefJson(value)) {
        return {
            $proc: value.$proc,
            input: extractTemplateValue(value.input),
        };
    }
    // Handle arrays
    if (Array.isArray(value)) {
        return value.map(extractTemplateValue);
    }
    // Handle plain objects
    const obj = value;
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
        result[key] = extractTemplateValue(val);
    }
    return result;
}
// =============================================================================
// Parse JSON with Procedure Refs
// =============================================================================
/**
 * Parse JSON string and convert $proc objects to runtime ProcedureRef objects.
 *
 * @param json - JSON string potentially containing procedure references
 * @returns Parsed object with ProcedureRef objects
 */
export function parseProcedureJson(json) {
    const parsed = JSON.parse(json);
    return convertJsonToRefs(parsed);
}
/**
 * Convert parsed JSON to runtime procedure refs.
 */
function convertJsonToRefs(value) {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value !== "object") {
        return value;
    }
    // Convert $proc objects to ProcedureRef
    if (isProcedureRefJson(value)) {
        return {
            [PROCEDURE_SYMBOL]: true,
            path: value.$proc,
            input: convertJsonToRefs(value.input),
        };
    }
    // Handle arrays
    if (Array.isArray(value)) {
        return value.map(convertJsonToRefs);
    }
    // Handle plain objects
    const obj = value;
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
        result[key] = convertJsonToRefs(val);
    }
    return result;
}
/**
 * Stringify an object with procedure refs to JSON.
 * Converts ProcedureRef objects to $proc JSON form.
 *
 * @param value - Object potentially containing ProcedureRef objects
 * @param space - Indentation (passed to JSON.stringify)
 * @returns JSON string
 */
export function stringifyProcedureJson(value, space) {
    const converted = extractTemplateValue(value);
    return JSON.stringify(converted, null, space);
}
//# sourceMappingURL=ref.js.map