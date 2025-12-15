/**
 * Component Definition Helpers
 *
 * Utilities for defining components as procedures.
 * Components are procedures with special handling for UI rendering.
 */
import { PROCEDURE_REGISTRY } from "../procedures/registry.js";
import { isStreamingFactory } from "./types.js";
/**
 * Default component input schema.
 * Validates the standard { data, size, path } structure.
 */
export const componentInputSchema = {
    parse(value) {
        const result = this.safeParse(value);
        if (!result.success) {
            throw new Error(result.error.message);
        }
        return result.data;
    },
    safeParse(value) {
        if (!value || typeof value !== "object") {
            return {
                success: false,
                error: { message: "Expected object", errors: [{ path: [], message: "Expected object" }] },
            };
        }
        const input = value;
        if (!("data" in input)) {
            return {
                success: false,
                error: { message: "Missing required field: data", errors: [{ path: ["data"], message: "Missing required field: data" }] },
            };
        }
        if (!("size" in input) || typeof input["size"] !== "object") {
            return {
                success: false,
                error: { message: "Missing or invalid field: size", errors: [{ path: ["size"], message: "Missing or invalid field: size" }] },
            };
        }
        const size = input["size"];
        if (typeof size["width"] !== "number" || typeof size["height"] !== "number") {
            return {
                success: false,
                error: { message: "Size must have numeric width and height", errors: [{ path: ["size"], message: "Size must have numeric width and height" }] },
            };
        }
        if (!("path" in input) || typeof input["path"] !== "string") {
            return {
                success: false,
                error: { message: "Missing or invalid field: path", errors: [{ path: ["path"], message: "Missing or invalid field: path" }] },
            };
        }
        return {
            success: true,
            data: input,
        };
    },
};
/**
 * Component output schema.
 * Validates that output is a serializable ComponentOutput.
 */
export const componentOutputSchema = {
    parse(value) {
        const result = this.safeParse(value);
        if (!result.success) {
            throw new Error(result.error.message);
        }
        return result.data;
    },
    safeParse(value) {
        if (!value || typeof value !== "object") {
            return {
                success: false,
                error: { message: "Expected object", errors: [{ path: [], message: "Expected object" }] },
            };
        }
        const output = value;
        if (typeof output["type"] !== "string") {
            return {
                success: false,
                error: { message: "Missing or invalid field: type", errors: [{ path: ["type"], message: "Missing or invalid field: type" }] },
            };
        }
        if (!("props" in output) || typeof output["props"] !== "object") {
            return {
                success: false,
                error: { message: "Missing or invalid field: props", errors: [{ path: ["props"], message: "Missing or invalid field: props" }] },
            };
        }
        return {
            success: true,
            data: output,
        };
    },
};
// =============================================================================
// defineComponent
// =============================================================================
/**
 * Define a component and convert it to a procedure.
 *
 * Components are registered under ["components", namespace?, type].
 *
 * @param definition - Component definition
 * @returns The component definition (for chaining)
 *
 * @example
 * ```typescript
 * // Simple component
 * const userCard = defineComponent({
 *   type: "user-card",
 *   namespace: "ui",
 *   input: userSchema,
 *   factory: (ctx) => ({
 *     type: "user-card",
 *     props: { user: ctx.data },
 *   }),
 * });
 *
 * // Streaming component
 * const liveDashboard = defineComponent({
 *   type: "live-dashboard",
 *   streaming: true,
 *   factory: async function* (ctx) {
 *     yield { type: "dashboard", props: { loading: true } };
 *     for await (const data of ctx.bus.stream("updates")) {
 *       yield { type: "dashboard", props: { data } };
 *     }
 *   },
 * });
 * ```
 */
export function defineComponent(definition) {
    // Build the procedure path
    const path = definition.namespace
        ? ["components", definition.namespace, definition.type]
        : ["components", definition.type];
    // Create the procedure from the component
    const procedure = componentToProcedure(definition, path);
    // Register the procedure
    PROCEDURE_REGISTRY.register(procedure);
    return definition;
}
/**
 * Convert a component definition to a procedure.
 *
 * @param definition - Component definition
 * @param path - Procedure path
 * @returns Procedure that wraps the component
 */
export function componentToProcedure(definition, path) {
    const { factory, streaming, metadata } = definition;
    // Build procedure metadata
    const procedureMetadata = {
        ...metadata,
        streaming: streaming ?? isStreamingFactory(factory),
        tags: [...(metadata?.tags ?? []), "component"],
    };
    // Create handler based on factory type
    const handler = streaming || isStreamingFactory(factory)
        ? createStreamingHandler(factory)
        : createStandardHandler(factory);
    return {
        path,
        input: definition.input
            ? createWrappedInputSchema(definition.input)
            : componentInputSchema,
        output: componentOutputSchema,
        metadata: procedureMetadata,
        streaming: procedureMetadata.streaming ?? false,
        handler,
    };
}
/**
 * Create a wrapped input schema that validates both structure and data.
 */
function createWrappedInputSchema(dataSchema) {
    return {
        parse(value) {
            const result = this.safeParse(value);
            if (!result.success) {
                throw new Error(result.error.message);
            }
            return result.data;
        },
        safeParse(value) {
            // First validate the structure
            const structureResult = componentInputSchema.safeParse(value);
            if (!structureResult.success) {
                return structureResult;
            }
            // Then validate the data field
            const input = structureResult.data;
            const dataResult = dataSchema.safeParse(input.data);
            if (!dataResult.success) {
                return {
                    success: false,
                    error: {
                        message: `Invalid data: ${dataResult.error.message}`,
                        errors: dataResult.error.errors.map(e => ({ path: ["data", ...e.path], message: e.message }))
                    },
                };
            }
            return {
                success: true,
                data: { ...input, data: dataResult.data },
            };
        },
    };
}
/**
 * Create a standard (non-streaming) handler from a component factory.
 */
function createStandardHandler(factory) {
    return async (input, ctx) => {
        const componentCtx = procedureToComponentContext(input, ctx);
        const result = factory(componentCtx);
        // Handle both sync and async returns
        if (result instanceof Promise) {
            return await result;
        }
        // Handle generator (shouldn't happen for standard, but just in case)
        if (isAsyncGenerator(result)) {
            // Take only the first yield
            const { value, done } = await result.next();
            if (done || value === undefined) {
                throw new Error("Component factory yielded no output");
            }
            return value;
        }
        return result;
    };
}
/**
 * Create a streaming handler from a component factory.
 */
function createStreamingHandler(factory) {
    return async function* (input, ctx) {
        const componentCtx = procedureToComponentContext(input, ctx);
        const result = factory(componentCtx);
        if (isAsyncGenerator(result)) {
            yield* result;
        }
        else {
            // Convert single result to single yield
            const output = result instanceof Promise ? await result : result;
            yield output;
        }
    };
}
/**
 * Convert procedure context to component context.
 */
function procedureToComponentContext(input, ctx) {
    const result = {
        data: input.data,
        size: input.size,
        path: input.path,
        depth: input.depth ?? 0,
        metadata: ctx.metadata,
        render: createRenderFunction(ctx),
    };
    if (ctx.bus) {
        result.bus = ctx.bus;
    }
    return result;
}
/**
 * Create a render function for child components.
 * This delegates to the procedure registry.
 */
function createRenderFunction(ctx) {
    return async (data, size, path) => {
        // Determine component type from data
        // This is a simple heuristic - in practice, the renderer would decide
        const type = inferComponentType(data);
        if (!type) {
            // Return a passthrough if we can't determine the type
            return {
                type: "raw",
                props: { data },
            };
        }
        // Find the component procedure
        const procedure = PROCEDURE_REGISTRY.get(["components", type]);
        if (!procedure || !procedure.handler) {
            return {
                type: "unknown",
                props: { type, data },
            };
        }
        // Call the procedure
        const input = {
            data,
            size,
            path,
            depth: (path.match(/\./g) || []).length,
        };
        const result = await procedure.handler(input, ctx);
        // Handle generator result
        if (isAsyncGenerator(result)) {
            const { value, done } = await result.next();
            if (done || value === undefined) {
                throw new Error("Child component yielded no output");
            }
            return value;
        }
        return result;
    };
}
/**
 * Infer component type from data.
 * This is a placeholder - real apps would use a type field or registry lookup.
 */
function inferComponentType(data) {
    if (!data || typeof data !== "object") {
        return null;
    }
    const obj = data;
    // Check for explicit __component field
    if (typeof obj["__component"] === "string") {
        return obj["__component"];
    }
    // Check for type field
    if (typeof obj["type"] === "string") {
        return obj["type"];
    }
    return null;
}
/**
 * Check if a value is an async generator.
 */
function isAsyncGenerator(value) {
    return (value !== null &&
        typeof value === "object" &&
        Symbol.asyncIterator in value &&
        typeof value.next === "function");
}
// =============================================================================
// Bundle Registration
// =============================================================================
/**
 * Register a bundle of components.
 *
 * @param bundle - Component bundle
 * @returns The registered components
 *
 * @example
 * ```typescript
 * const registered = registerBundle({
 *   namespace: "ui",
 *   components: [buttonComponent, cardComponent],
 * });
 * ```
 */
export function registerBundle(bundle) {
    const registered = [];
    for (const component of bundle.components) {
        // Apply bundle namespace if component doesn't have one
        const withNamespace = {
            ...component,
            namespace: component.namespace ?? bundle.namespace,
        };
        defineComponent(withNamespace);
        registered.push(withNamespace);
    }
    return registered;
}
/**
 * Create a component bundle.
 *
 * @param namespace - Shared namespace
 * @param components - Component definitions
 * @param metadata - Optional bundle metadata
 * @returns ComponentBundle
 */
export function createBundle(namespace, components, metadata) {
    const result = { namespace, components };
    if (metadata) {
        result.metadata = metadata;
    }
    return result;
}
// =============================================================================
// Quick Define Helpers
// =============================================================================
/**
 * Define a simple component with minimal boilerplate.
 *
 * @param type - Component type
 * @param factory - Factory function
 * @returns ComponentDefinition
 *
 * @example
 * ```typescript
 * const badge = simpleComponent("badge", (ctx) => ({
 *   type: "badge",
 *   props: { label: ctx.data.label },
 * }));
 * ```
 */
export function simpleComponent(type, factory) {
    return defineComponent({
        type,
        factory,
    });
}
/**
 * Define a namespaced component with minimal boilerplate.
 *
 * @param namespace - Component namespace
 * @param type - Component type
 * @param factory - Factory function
 * @returns ComponentDefinition
 */
export function namespacedComponent(namespace, type, factory) {
    return defineComponent({
        type,
        namespace,
        factory,
    });
}
/**
 * Define a streaming component.
 *
 * @param type - Component type
 * @param factory - Generator factory function
 * @returns ComponentDefinition
 */
export function streamingComponent(type, factory) {
    return defineComponent({
        type,
        streaming: true,
        factory,
    });
}
//# sourceMappingURL=define.js.map