/**
 * Zod to JSON Schema Converter
 *
 * Converts Zod schemas to JSON Schema format for MCP tool inputSchema.
 * Uses zod-to-json-schema with caching for performance.
 */
import type { JsonSchema } from "../types.js";
/**
 * Schema interface compatible with Zod.
 * Allows the system to work without direct Zod dependency.
 */
export interface SchemaLike {
    parse?(data: unknown): unknown;
    safeParse?(data: unknown): {
        success: boolean;
        data?: unknown;
        error?: unknown;
    };
    _def?: unknown;
}
/**
 * Options for Zod to JSON Schema conversion.
 */
export interface ZodToJsonSchemaOptions {
    /** Name for the schema (used in definitions) */
    name?: string;
    /** Pre-existing definitions to include */
    definitions?: Record<string, unknown>;
}
/**
 * Convert a schema to JSON Schema.
 *
 * Uses zod-to-json-schema library for actual Zod schemas,
 * with safe fallbacks for non-Zod implementations.
 *
 * @param schema - Schema to convert (Zod or ZodLike)
 * @param options - Conversion options
 * @returns JSON Schema representation
 */
export declare function zodToJsonSchema(schema: SchemaLike | unknown, options?: ZodToJsonSchemaOptions): JsonSchema;
/**
 * Convert a schema to JSON Schema with caching.
 *
 * @param schema - Schema to convert (Zod or ZodLike)
 * @param cacheKey - Unique key for caching (typically procedure path)
 * @returns Cached or freshly converted JSON Schema
 */
export declare function cachedZodToJsonSchema(schema: SchemaLike | unknown, cacheKey: string): JsonSchema;
/**
 * Clear the schema cache.
 * Useful when procedures are re-registered with different schemas.
 */
export declare function clearSchemaCache(): void;
/**
 * Get the current schema cache size.
 */
export declare function getSchemaCacheSize(): number;
//# sourceMappingURL=zod-to-json-schema.d.ts.map