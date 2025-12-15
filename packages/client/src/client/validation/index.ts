/**
 * Zod Validation Module
 *
 * Type-safe schema validation for RPC requests and responses.
 * Works with Zod as an optional peer dependency.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { Client } from "client";
 * import { createZodMiddleware, ValidationError } from "client/client/validation";
 *
 * const client = new Client({ transport })
 *   .use(createZodMiddleware({ mode: "strict" }))
 *   .schema({ service: "users", operation: "get" }, {
 *     input: z.object({ id: z.string() }),
 *     output: z.object({ id: z.string(), name: z.string() }),
 *   });
 *
 * try {
 *   const user = await client.call(
 *     { service: "users", operation: "get" },
 *     { id: "123" }
 *   );
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.error(error.details);
 *   }
 * }
 * ```
 */

// Core types
export {
  type ZodLike,
  type ZodErrorLike,
  type SchemaDefinition,
  type SchemaRegistry,
  type MethodKey,
  type ValidationPhase,
  type ZodValidationContext,
  methodToKey,
  keyToMethod,
  ValidationError,
  type InferInput,
  type InferOutput,
} from "./types.js";

// Middleware
export {
  createZodMiddleware,
  type ZodMiddlewareOptions,
  type ValidationMode,
  type ZodMiddleware,
  SCHEMA_REGISTRY,
} from "./middleware.js";

// Schemas
export * from "./schemas/index.js";
