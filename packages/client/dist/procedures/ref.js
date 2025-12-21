/**
 * Procedure Reference System
 *
 * Enables procedures-as-data: procedures can be passed as inputs to other procedures,
 * composed declaratively via JSON, or imperatively via TypeScript.
 *
 * Key concepts:
 * - PROCEDURE_SYMBOL: Symbol tag to identify procedure references in JSON/objects
 * - ProcedureRef: A reference to a procedure with pre-bound input
 * - $when: Controls when a procedure reference is executed during hydration
 * - $name: Names a context so nested refs can defer execution to it
 * - hydrateInput: Walks input tree and executes nested procedure references
 * - executeRef: Helper for procedures to execute deferred refs
 * - proc(): Factory function to create procedure references
 *
 * ## Execution Control with $when
 *
 * The `$when` field controls when a procedure reference is executed:
 * - `"$immediate"` (or absent): Execute during hydration (default)
 * - `"$never"`: Never execute during hydration, pass as pure data
 * - `"$parent"`: Defer to parent procedure (pass as data)
 * - `"someName"`: Defer to named ancestor context (matched via $name)
 *
 * ## Named Contexts with $name
 *
 * Use `$name` to create a named execution context that nested refs can target:
 *
 * @example
 * ```typescript
 * // Declarative (JSON) with execution control
 * const pipelineJson = {
 *   $name: "traversal",
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: {
 *       $proc: ["git", "add"],
 *       input: { all: true },
 *       $when: "traversal",  // Defer to traversal context
 *     },
 *   },
 * };
 *
 * // The inner $proc is NOT executed during hydration.
 * // dag.traverse receives it as data and executes per-node.
 * await client.exec(pipelineJson);
 * ```
 */
// =============================================================================
// Procedure Reference Constants
// =============================================================================
/**
 * Symbol used to tag objects as procedure references.
 * This allows procedure references to be identified during input hydration.
 */
export const PROCEDURE_SYMBOL = Symbol.for("@mark/procedure");
/**
 * JSON key used to identify procedure references in serialized form.
 */
export const PROCEDURE_JSON_KEY = "$proc";
/**
 * JSON key used to control when a procedure reference is executed.
 */
export const PROCEDURE_WHEN_KEY = "$when";
/**
 * JSON key used to name a context for deferred execution.
 */
export const PROCEDURE_NAME_KEY = "$name";
// =============================================================================
// Execution Timing Constants
// =============================================================================
/**
 * Execute immediately during hydration (default behavior).
 */
export const WHEN_IMMEDIATE = "$immediate";
/**
 * Never execute during hydration - pass as pure data.
 */
export const WHEN_NEVER = "$never";
/**
 * Defer to parent procedure - pass as data for parent to execute.
 */
export const WHEN_PARENT = "$parent";
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
/**
 * Get the $when value from a procedure reference.
 * Returns "$immediate" if not specified.
 */
export function getRefWhen(ref) {
    if (isProcedureRef(ref)) {
        return ref.$when ?? WHEN_IMMEDIATE;
    }
    return ref.$when ?? WHEN_IMMEDIATE;
}
/**
 * Get the $name value from a procedure reference, if any.
 */
export function getRefName(ref) {
    if (isProcedureRef(ref)) {
        return ref.$name;
    }
    return ref.$name;
}
/**
 * Check if a procedure reference should be executed in the given context.
 *
 * @param ref - The procedure reference to check
 * @param contextStack - Stack of named contexts (innermost first)
 * @param isParentContext - Whether we're checking from a parent procedure
 * @returns true if the ref should be executed now
 */
export function shouldExecuteRef(ref, contextStack, isParentContext = false) {
    const when = getRefWhen(ref);
    // $immediate: always execute during hydration
    if (when === WHEN_IMMEDIATE) {
        return true;
    }
    // $never: never execute during hydration
    if (when === WHEN_NEVER) {
        return false;
    }
    // $parent: execute only when called from parent procedure
    if (when === WHEN_PARENT) {
        return isParentContext;
    }
    // Named context: execute only when inside that named context
    // The ref should execute when we're currently inside the named context
    return contextStack.includes(when);
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
    _name;
    _when;
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
     * Name this execution context (for nested refs to target with $when).
     */
    name(name) {
        this._name = name;
        return this;
    }
    /**
     * Set when this reference should be executed.
     * @param when - "$immediate", "$never", "$parent", or a named context
     */
    when(when) {
        this._when = when;
        return this;
    }
    /**
     * Shorthand for .when("$never") - pass as pure data.
     */
    defer() {
        this._when = WHEN_NEVER;
        return this;
    }
    /**
     * Shorthand for .when("$parent") - defer to parent procedure.
     */
    deferToParent() {
        this._when = WHEN_PARENT;
        return this;
    }
    /**
     * Build the procedure reference object.
     */
    build() {
        const ref = {
            [PROCEDURE_SYMBOL]: true,
            path: this._path,
            input: this._input,
        };
        if (this._name) {
            ref.$name = this._name;
        }
        if (this._when) {
            ref.$when = this._when;
        }
        return ref;
    }
    /**
     * Convert to JSON-serializable form.
     */
    toJson() {
        const json = {
            $proc: this._path,
            input: this._input,
        };
        if (this._name) {
            json.$name = this._name;
        }
        if (this._when) {
            json.$when = this._when;
        }
        return json;
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
 * objects with the result of executing that procedure, respecting $when timing.
 *
 * @param input - The input object potentially containing procedure references
 * @param executor - Function to execute procedure references
 * @param options - Hydration options
 * @returns The hydrated input with executed procedure refs replaced by their results
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
    const { maxDepth = 10, contextStack = [] } = options;
    const ctx = { executor, maxDepth, contextStack };
    return hydrateValue(input, ctx, 0);
}
/**
 * Internal recursive hydration function.
 */
async function hydrateValue(value, ctx, depth) {
    // Depth check
    if (depth > ctx.maxDepth) {
        throw new Error(`Hydration depth exceeded maximum of ${ctx.maxDepth}`);
    }
    // Handle null/undefined/primitives
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value !== "object") {
        return value;
    }
    // Check if this is a procedure reference ($proc)
    if (isAnyProcedureRef(value)) {
        const name = getRefName(value);
        // Check if we should execute this ref based on $when
        if (!shouldExecuteRef(value, ctx.contextStack, false)) {
            // Don't execute - pass through as data
            // But still hydrate the input for any nested $immediate refs
            const ref = normalizeRef(value);
            const hydratedInput = await hydrateValue(ref.input, ctx, depth + 1);
            // Return the ref with hydrated input
            if (isProcedureRefJson(value)) {
                return {
                    ...value,
                    input: hydratedInput,
                };
            }
            else {
                return {
                    ...value,
                    input: hydratedInput,
                };
            }
        }
        // Execute this ref
        const ref = normalizeRef(value);
        // Push this context name if present
        const newStack = name ? [name, ...ctx.contextStack] : ctx.contextStack;
        const newCtx = { ...ctx, contextStack: newStack };
        // First, hydrate the input of the procedure reference itself
        const hydratedInput = await hydrateValue(ref.input, newCtx, depth + 1);
        // Then execute the procedure with hydrated input
        const result = await ctx.executor(ref.path, hydratedInput);
        return result;
    }
    // Handle arrays
    if (Array.isArray(value)) {
        const hydrated = await Promise.all(value.map((item) => hydrateValue(item, ctx, depth + 1)));
        return hydrated;
    }
    // Handle plain objects
    const obj = value;
    const entries = Object.entries(obj);
    const hydratedEntries = await Promise.all(entries.map(async ([key, val]) => {
        const hydratedVal = await hydrateValue(val, ctx, depth + 1);
        return [key, hydratedVal];
    }));
    return Object.fromEntries(hydratedEntries);
}
// =============================================================================
// Deferred Ref Execution
// =============================================================================
/**
 * Execute a deferred procedure reference.
 *
 * This is a helper for procedures that receive deferred refs (via $when)
 * and need to execute them with additional context.
 *
 * @param ref - The procedure reference to execute
 * @param executor - Function to execute the procedure
 * @param additionalInput - Additional input to merge (e.g., cwd for dag.traverse)
 * @returns The result of executing the procedure
 *
 * @example
 * ```typescript
 * // In dag.traverse, execute a deferred ref with cwd
 * const result = await executeRef(
 *   input.visit,
 *   (path, input) => ctx.client.call(path, input),
 *   { cwd: node.repoPath }
 * );
 * ```
 */
export async function executeRef(ref, executor, additionalInput) {
    const normalized = normalizeRef(ref);
    const baseInput = typeof normalized.input === "object" ? normalized.input : {};
    // Merge additional input
    const mergedInput = {
        ...baseInput,
        ...additionalInput,
    };
    // Hydrate the merged input (execute any nested $immediate refs)
    const hydratedInput = await hydrateInput(mergedInput, executor, {
        contextStack: [], // Fresh context for deferred execution
    });
    return executor(normalized.path, hydratedInput);
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