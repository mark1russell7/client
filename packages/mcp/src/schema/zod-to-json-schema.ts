/**
 * Zod to JSON Schema Converter
 *
 * Converts Zod schemas to JSON Schema format for MCP tool inputSchema.
 * Uses zod-to-json-schema with caching for performance.
 */

import { zodToJsonSchema as zodConvert } from "zod-to-json-schema";
import type { JsonSchema } from "../types.js";

/**
 * Schema interface compatible with Zod.
 * Allows the system to work without direct Zod dependency.
 */
export interface SchemaLike {
  parse?(data: unknown): unknown;
  safeParse?(data: unknown): { success: boolean; data?: unknown; error?: unknown };
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
export function zodToJsonSchema(
  schema: SchemaLike | unknown,
  options?: ZodToJsonSchemaOptions
): JsonSchema {
  // Check if it's actually a Zod schema (has _def property)
  if (schema && typeof schema === "object" && "_def" in schema) {
    try {
      const result = zodConvert(schema as Parameters<typeof zodConvert>[0], {
        name: options?.name,
        $refStrategy: "none", // Inline all refs for MCP compatibility
        errorMessages: false,
      });

      // The library returns { $schema, ...rest } or just the schema
      // We want to strip $schema for MCP
      if (typeof result === "object" && result !== null) {
        const { $schema: _, ...rest } = result as Record<string, unknown>;
        return rest as JsonSchema;
      }

      return result as JsonSchema;
    } catch {
      // Fallback to permissive schema on conversion error
      return { type: "object", additionalProperties: true };
    }
  }

  // For non-Zod schemas (our ZodLike interface), return permissive schema
  return { type: "object", additionalProperties: true };
}

// Schema cache for performance
const schemaCache = new Map<string, JsonSchema>();

/**
 * Convert a schema to JSON Schema with caching.
 *
 * @param schema - Schema to convert (Zod or ZodLike)
 * @param cacheKey - Unique key for caching (typically procedure path)
 * @returns Cached or freshly converted JSON Schema
 */
export function cachedZodToJsonSchema(
  schema: SchemaLike | unknown,
  cacheKey: string
): JsonSchema {
  const cached = schemaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const jsonSchema = zodToJsonSchema(schema);
  schemaCache.set(cacheKey, jsonSchema);
  return jsonSchema;
}

/**
 * Clear the schema cache.
 * Useful when procedures are re-registered with different schemas.
 */
export function clearSchemaCache(): void {
  schemaCache.clear();
}

/**
 * Get the current schema cache size.
 */
export function getSchemaCacheSize(): number {
  return schemaCache.size;
}
