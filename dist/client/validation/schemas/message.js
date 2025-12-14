/**
 * Universal Message Zod Schemas
 *
 * Generic schemas for the universal RPC message format.
 * These validate the internal message structure, with payload type parameterized.
 */
// =============================================================================
// Schema Factories
// =============================================================================
/**
 * Create a Method schema.
 *
 * @param z - Zod module
 * @returns Zod schema for Method
 */
export function createMethodSchema(z) {
    return z.object({
        service: z.string().min(1),
        operation: z.string().min(1),
        version: z.string().optional(),
    });
}
/**
 * Create a Metadata schema (passthrough for extensibility).
 *
 * @param z - Zod module
 * @returns Zod schema for Metadata
 */
export function createMetadataSchema(z) {
    return z.object({}).passthrough();
}
/**
 * Create a universal Message schema with parameterized payload.
 *
 * This validates the internal message format used by the client.
 * The payload schema allows type-safe validation of request data.
 *
 * @param z - Zod module
 * @param payloadSchema - Schema for the message payload
 * @returns Zod schema for Message
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 *
 * const GetUserPayload = z.object({ id: z.string() });
 * const MessageSchema = createMessageSchema(z, GetUserPayload);
 *
 * MessageSchema.parse({
 *   id: "req-123",
 *   method: { service: "users", operation: "get" },
 *   payload: { id: "user-456" },
 *   metadata: { auth: { token: "..." } }
 * });
 * ```
 */
export function createMessageSchema(z, payloadSchema) {
    return z.object({
        id: z.string().min(1),
        method: createMethodSchema(z),
        payload: payloadSchema,
        metadata: createMetadataSchema(z),
    });
}
/**
 * Create a Status schema (discriminated union).
 *
 * @param z - Zod module
 * @returns Zod schema for Status
 */
export function createStatusSchema(z) {
    // Note: This is a simplified version. Full discriminated union requires
    // z.discriminatedUnion which may not be available in all Zod versions.
    return z.object({
        type: z.enum(["success", "error"]),
        code: z.union([z.number(), z.string()]),
        message: z.string().optional(),
        retryable: z.boolean?.().optional(),
    });
}
/**
 * Create a ResponseItem schema with parameterized payload.
 *
 * This validates the internal response format used by the client.
 * The payload schema allows type-safe validation of response data.
 *
 * @param z - Zod module
 * @param payloadSchema - Schema for the response payload
 * @returns Zod schema for ResponseItem
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
 * const ResponseSchema = createResponseItemSchema(z, UserSchema);
 *
 * ResponseSchema.parse({
 *   id: "req-123",
 *   status: { type: "success", code: 200 },
 *   payload: { id: "user-456", name: "John", email: "john@example.com" },
 *   metadata: {}
 * });
 * ```
 */
export function createResponseItemSchema(z, payloadSchema) {
    return z.object({
        id: z.string(),
        status: createStatusSchema(z),
        payload: payloadSchema,
        metadata: createMetadataSchema(z),
    });
}
//# sourceMappingURL=message.js.map