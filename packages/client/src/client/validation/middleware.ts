/**
 * Schema Validation Middleware for transport calls
 *
 * Validates the request and response payloads of calls that go to a transport (a remote
 * service), by method key. Schemas can be registered per-route (`Client.schema()`) or
 * overridden per-call.
 *
 * A procedure of the registry does not need this middleware: `invokeProcedure` validates its
 * input and output with its own schemas. Both use `validateSchema()` of the core, so any
 * Standard Schema (zod 4, valibot, arktype) works here too, also an asynchronous one.
 */

import type { ClientMiddleware, ClientRunner, ClientContext, ResponseItem } from "../types.js";
import type {
  SchemaDefinition,
  SchemaRegistry,
  MethodKey,
  ZodValidationContext,
} from "./types.js";
import { methodToKey, ValidationError } from "./types.js";
import { validateSchema, type ProcedureSchema } from "../../procedures/schema.js";

// =============================================================================
// Middleware Options
// =============================================================================

/**
 * Validation mode determines behavior on validation failure.
 */
export type ValidationMode = "strict" | "warn" | "silent";

/**
 * Options for Zod validation middleware.
 */
export interface ZodMiddlewareOptions {
  /**
   * Validation mode:
   * - "strict": throw ValidationError on failure (default)
   * - "warn": log warning but continue with unvalidated data
   * - "silent": validate but don't throw or log
   */
  mode?: ValidationMode;

  /**
   * Whether to strip unknown keys from validated objects.
   * Only works if schemas use .strip() or similar.
   * @default false
   */
  transformOutput?: boolean;

  /**
   * Custom error handler for validation failures.
   * Called in addition to mode behavior (not instead of).
   */
  onValidationError?: (error: ValidationError) => void;
}

// =============================================================================
// Schema Registry Holder
// =============================================================================

/**
 * Symbol for accessing the schema registry from middleware.
 */
export const SCHEMA_REGISTRY : unique symbol = Symbol.for("zod-middleware-schema-registry");

/**
 * Middleware with attached schema registry.
 */
export type ZodMiddleware = ClientMiddleware & {
  [SCHEMA_REGISTRY]: SchemaRegistry;
};

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
export function createZodMiddleware(options: ZodMiddlewareOptions = {}): ZodMiddleware {
  const { mode = "strict", transformOutput = false, onValidationError } = options;

  // Schema registry (populated via Client.schema())
  const schemaRegistry: SchemaRegistry = new Map();

  const middleware: ClientMiddleware = <TReq, TRes>(
    next: ClientRunner<TReq, TRes>,
  ): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>): AsyncIterable<ResponseItem<TRes>> {
      const methodKey = methodToKey(context.message.method);

      // Get schema: per-call override > registry
      const schema = getSchemaForContext(context, schemaRegistry, methodKey);

      // Validate input
      let validatedPayload = context.message.payload;
      let inputValidated = false;

      if (schema?.input) {
        const result = await validatePayload(
          context.message.payload,
          schema.input,
          "input",
          context.message.method,
          { mode, onValidationError: onValidationError ?? undefined },
        );

        inputValidated = true;

        if (result.success && transformOutput) {
          validatedPayload = result.data as TReq;
          context.message.payload = validatedPayload;
        }
      }

      // Store validation context in metadata
      (context.message.metadata as any).__validation = {
        inputValidated,
        outputValidated: !!schema?.output,
        methodKey,
      } satisfies ZodValidationContext["validation"];

      // Execute downstream middleware
      const responseStream = next(context);

      // Validate each response item
      for await (const item of responseStream) {
        // Only validate successful responses with output schema
        if (schema?.output && item.status.type === "success") {
          const result = await validatePayload(
            item.payload,
            schema.output,
            "output",
            context.message.method,
            { mode, onValidationError: onValidationError ?? undefined },
          );

          if (result.success && transformOutput) {
            yield { ...item, payload: result.data as TRes };
            continue;
          }
        }

        yield item;
      }
    };
  };

  // Attach registry for Client.schema() access
  (middleware as ZodMiddleware)[SCHEMA_REGISTRY] = schemaRegistry;

  return middleware as ZodMiddleware;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Get schema for a request, checking per-call override first.
 */
function getSchemaForContext(
  context: ClientContext,
  registry: SchemaRegistry,
  methodKey: MethodKey,
): SchemaDefinition | undefined {
  // Check per-call override (from CallOptions.schema via metadata.__schema)
  const perCallSchema = (context.message.metadata as any)?.__schema as SchemaDefinition | undefined;
  if (perCallSchema) {
    return perCallSchema;
  }

  // Fall back to registry
  return registry.get(methodKey);
}

/**
 * Validate a payload against a schema.
 */
async function validatePayload<T>(
  payload: unknown,
  schema: ProcedureSchema<T>,
  phase: "input" | "output",
  method: { service: string; operation: string; version?: string },
  options: {
    mode: ValidationMode;
    onValidationError: ((error: ValidationError) => void) | undefined;
  },
): Promise<{ success: true; data: T } | { success: false }> {
  // The one validation path of the core: any Standard Schema, also an asynchronous one
  const result = await validateSchema(schema, payload);

  if (!result.ok) {
    const error = new ValidationError(
      `${phase} validation failed for ${method.service}.${method.operation}`,
      phase,
      { message: result.message, issues: result.issues.map((issue) => ({ message: issue.message, path: (issue.path ?? []).map((part) => (typeof part === "object" ? part.key : part)) })) },
      method,
    );

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

  return { success: true, data: result.value };
}

// =============================================================================
// Re-export types
// =============================================================================

export type { ZodValidationContext } from "./types.js";
