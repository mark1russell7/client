/**
 * Transport-Level Zod Schemas
 *
 * Generic schemas for HTTP request/response structures.
 * These validate the transport format, with the body type parameterized.
 */
import type { ZodLike } from "../types";
/**
 * HTTP methods supported by the transport.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
/**
 * HTTP request structure (generic over body type).
 */
export interface HttpRequest<TBody = unknown> {
    method: HttpMethod;
    url: string;
    headers: Record<string, string>;
    body: TBody;
}
/**
 * HTTP response structure (generic over body type).
 */
export interface HttpResponse<TBody = unknown> {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: TBody;
}
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
export declare function createHttpRequestSchema<TBody>(z: ZodModule, bodySchema: ZodLike<TBody>): ZodLike<HttpRequest<TBody>>;
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
export declare function createHttpResponseSchema<TBody>(z: ZodModule, bodySchema: ZodLike<TBody>): ZodLike<HttpResponse<TBody>>;
/**
 * Minimal Zod module interface for schema creation.
 * Allows passing Zod without importing it directly.
 */
export interface ZodModule {
    object: (shape: Record<string, unknown>) => unknown;
    string: () => unknown;
    number: () => {
        int: () => {
            min: (n: number) => {
                max: (n: number) => unknown;
            };
        };
    };
    record: (valueSchema: unknown) => unknown;
    enum: <T extends readonly [string, ...string[]]>(values: T) => unknown;
}
/**
 * Type helper to extract body type from a transport schema.
 */
export type ExtractBody<T> = T extends HttpRequest<infer B> ? B : T extends HttpResponse<infer B> ? B : unknown;
//# sourceMappingURL=transport.d.ts.map