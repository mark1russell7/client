/**
 * Universal Message Zod Schemas
 *
 * Generic schemas for the universal RPC message format.
 * These validate the internal message structure, with payload type parameterized.
 */
import type { ZodLike } from "../types";
import type { ZodModule } from "./transport";
/**
 * Method identifier structure.
 */
export interface MethodShape {
    service: string;
    operation: string;
    version?: string;
}
/**
 * Universal request message structure (generic over payload).
 */
export interface MessageShape<TPayload = unknown> {
    id: string;
    method: MethodShape;
    payload: TPayload;
    metadata: Record<string, unknown>;
}
/**
 * Status structure for responses.
 */
export type StatusShape = {
    type: "success";
    code: number;
} | {
    type: "error";
    code: string;
    message: string;
    retryable: boolean;
};
/**
 * Universal response item structure (generic over payload).
 */
export interface ResponseItemShape<TPayload = unknown> {
    id: string;
    status: StatusShape;
    payload: TPayload;
    metadata: Record<string, unknown>;
}
/**
 * Create a Method schema.
 *
 * @param z - Zod module
 * @returns Zod schema for Method
 */
export declare function createMethodSchema(z: ZodModule): ZodLike<MethodShape>;
/**
 * Create a Metadata schema (passthrough for extensibility).
 *
 * @param z - Zod module
 * @returns Zod schema for Metadata
 */
export declare function createMetadataSchema(z: ZodModule): ZodLike<Record<string, unknown>>;
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
export declare function createMessageSchema<TPayload>(z: ZodModule, payloadSchema: ZodLike<TPayload>): ZodLike<MessageShape<TPayload>>;
/**
 * Create a Status schema (discriminated union).
 *
 * @param z - Zod module
 * @returns Zod schema for Status
 */
export declare function createStatusSchema(z: ZodModule): ZodLike<StatusShape>;
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
export declare function createResponseItemSchema<TPayload>(z: ZodModule, payloadSchema: ZodLike<TPayload>): ZodLike<ResponseItemShape<TPayload>>;
/**
 * Extract payload type from a message schema.
 */
export type ExtractPayload<T> = T extends MessageShape<infer P> ? P : T extends ResponseItemShape<infer P> ? P : unknown;
//# sourceMappingURL=message.d.ts.map