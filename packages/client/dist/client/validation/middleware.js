/**
 * Zod Validation Middleware
 *
 * Validates request and response payloads using Zod schemas.
 * Schemas can be registered per-route or overridden per-call.
 */
import { methodToKey, ValidationError } from "./types";
// =============================================================================
// Schema Registry Holder
// =============================================================================
/**
 * Symbol for accessing the schema registry from middleware.
 */
export const SCHEMA_REGISTRY = Symbol.for("zod-middleware-schema-registry");
// =============================================================================
// Middleware Implementation
// =============================================================================
/**
 * Create Zod validation middleware.
 *
 * This middleware validates request payloads before sending and
 * response payloads after receiving, using registered schemas.
 *
 * Schemas are registered via `Client.schema()` or passed per-call
 * in the options.
 *
 * @param options - Middleware configuration
 * @returns Middleware with attached schema registry
 *
 * @example
 * ```typescript
 * const client = new Client({ transport })
 *   .use(createZodMiddleware())
 *   .schema({ service: "users", operation: "get" }, {
 *     input: z.object({ id: z.string() }),
 *     output: UserSchema,
 *   });
 *
 * // Validation happens automatically
 * const user = await client.call(
 *   { service: "users", operation: "get" },
 *   { id: "123" }
 * );
 * ```
 */
export function createZodMiddleware(options = {}) {
    const { mode = "strict", transformOutput = false, onValidationError } = options;
    // Schema registry (populated via Client.schema())
    const schemaRegistry = new Map();
    const middleware = (next) => {
        return async function* (context) {
            const methodKey = methodToKey(context.message.method);
            // Get schema: per-call override > registry
            const schema = getSchemaForContext(context, schemaRegistry, methodKey);
            // Validate input
            let validatedPayload = context.message.payload;
            let inputValidated = false;
            if (schema?.input) {
                const result = validatePayload(context.message.payload, schema.input, "input", context.message.method, { mode, onValidationError: onValidationError ?? undefined });
                inputValidated = true;
                if (result.success && transformOutput) {
                    validatedPayload = result.data;
                    context.message.payload = validatedPayload;
                }
            }
            // Store validation context in metadata
            context.message.metadata.__validation = {
                inputValidated,
                outputValidated: !!schema?.output,
                methodKey,
            };
            // Execute downstream middleware
            const responseStream = next(context);
            // Validate each response item
            for await (const item of responseStream) {
                // Only validate successful responses with output schema
                if (schema?.output && item.status.type === "success") {
                    const result = validatePayload(item.payload, schema.output, "output", context.message.method, { mode, onValidationError: onValidationError ?? undefined });
                    if (result.success && transformOutput) {
                        yield { ...item, payload: result.data };
                        continue;
                    }
                }
                yield item;
            }
        };
    };
    // Attach registry for Client.schema() access
    middleware[SCHEMA_REGISTRY] = schemaRegistry;
    return middleware;
}
// =============================================================================
// Internal Helpers
// =============================================================================
/**
 * Get schema for a request, checking per-call override first.
 */
function getSchemaForContext(context, registry, methodKey) {
    // Check per-call override (from CallOptions.schema via metadata.__schema)
    const perCallSchema = context.message.metadata?.__schema;
    if (perCallSchema) {
        return perCallSchema;
    }
    // Fall back to registry
    return registry.get(methodKey);
}
/**
 * Validate a payload against a schema.
 */
function validatePayload(payload, schema, phase, method, options) {
    const result = schema.safeParse(payload);
    if (!result.success) {
        const error = new ValidationError(`${phase} validation failed for ${method.service}.${method.operation}`, phase, result.error, method);
        // Call custom error handler
        options.onValidationError?.(error);
        // Handle based on mode
        switch (options.mode) {
            case "strict":
                throw error;
            case "warn":
                console.warn(`[Zod Validation] ${error.details}`);
                break;
            case "silent":
                // No action
                break;
        }
        return { success: false };
    }
    return { success: true, data: result.data };
}
//# sourceMappingURL=middleware.js.map