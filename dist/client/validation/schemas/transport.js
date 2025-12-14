/**
 * Transport-Level Zod Schemas
 *
 * Generic schemas for HTTP request/response structures.
 * These validate the transport format, with the body type parameterized.
 */
// =============================================================================
// Zod Schema Factories
// =============================================================================
/**
 * Create an HTTP request schema with a parameterized body type.
 *
 * This validates the structure of an HTTP request at the transport layer.
 * The body schema is provided to allow type-safe validation of the
 * request payload.
 *
 * @param z - Zod module (passed to avoid direct dependency)
 * @param bodySchema - Schema for the request body
 * @returns Zod schema for HTTP request
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 *
 * const UserPayloadSchema = z.object({
 *   name: z.string(),
 *   email: z.string().email(),
 * });
 *
 * const RequestSchema = createHttpRequestSchema(z, UserPayloadSchema);
 *
 * // Validates full HTTP request structure
 * RequestSchema.parse({
 *   method: "POST",
 *   url: "https://api.example.com/users",
 *   headers: { "Content-Type": "application/json" },
 *   body: { name: "John", email: "john@example.com" }
 * });
 * ```
 */
export function createHttpRequestSchema(z, bodySchema) {
    return z.object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
        url: z.string(),
        headers: z.record(z.string()),
        body: bodySchema,
    });
}
/**
 * Create an HTTP response schema with a parameterized body type.
 *
 * This validates the structure of an HTTP response at the transport layer.
 * The body schema is provided to allow type-safe validation of the
 * response payload.
 *
 * @param z - Zod module (passed to avoid direct dependency)
 * @param bodySchema - Schema for the response body
 * @returns Zod schema for HTTP response
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 *
 * const UserSchema = z.object({
 *   id: z.string(),
 *   name: z.string(),
 *   email: z.string().email(),
 * });
 *
 * const ResponseSchema = createHttpResponseSchema(z, UserSchema);
 *
 * // Validates full HTTP response structure
 * ResponseSchema.parse({
 *   status: 200,
 *   statusText: "OK",
 *   headers: { "Content-Type": "application/json" },
 *   body: { id: "123", name: "John", email: "john@example.com" }
 * });
 * ```
 */
export function createHttpResponseSchema(z, bodySchema) {
    return z.object({
        status: z.number().int().min(100).max(599),
        statusText: z.string(),
        headers: z.record(z.string()),
        body: bodySchema,
    });
}
//# sourceMappingURL=transport.js.map