/**
 * Zod Validation Middleware
 *
 * Validates request and response payloads using Zod schemas.
 * Schemas can be registered per-route or overridden per-call.
 */
import type { ClientMiddleware } from "../types";
import type { SchemaRegistry } from "./types";
import { ValidationError } from "./types";
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
/**
 * Symbol for accessing the schema registry from middleware.
 */
export declare const SCHEMA_REGISTRY: unique symbol;
/**
 * Middleware with attached schema registry.
 */
export type ZodMiddleware = ClientMiddleware & {
    [SCHEMA_REGISTRY]: SchemaRegistry;
};
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
export declare function createZodMiddleware(options?: ZodMiddlewareOptions): ZodMiddleware;
export type { ZodValidationContext } from "./types";
//# sourceMappingURL=middleware.d.ts.map