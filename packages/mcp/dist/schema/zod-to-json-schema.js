/**
 * Zod to JSON Schema Converter
 *
 * Converts Zod schemas to JSON Schema format for MCP tool inputSchema.
 * Uses zod-to-json-schema with caching for performance.
 */
import { zodToJsonSchema as zodConvert } from "zod-to-json-schema";
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
export function zodToJsonSchema(schema, options) {
    // Check if it's actually a Zod schema (has _def property)
    if (schema && typeof schema === "object" && "_def" in schema) {
        try {
            const result = zodConvert(schema, {
                name: options?.name,
                $refStrategy: "none", // Inline all refs for MCP compatibility
                errorMessages: false,
            });
            // The library returns { $schema, ...rest } or just the schema
            // We want to strip $schema for MCP
            if (typeof result === "object" && result !== null) {
                const { $schema: _, ...rest } = result;
                return rest;
            }
            return result;
        }
        catch {
            // Fallback to permissive schema on conversion error
            return { type: "object", additionalProperties: true };
        }
    }
    // For non-Zod schemas (our ZodLike interface), return permissive schema
    return { type: "object", additionalProperties: true };
}
// Schema cache for performance
const schemaCache = new Map();
/**
 * Convert a schema to JSON Schema with caching.
 *
 * @param schema - Schema to convert (Zod or ZodLike)
 * @param cacheKey - Unique key for caching (typically procedure path)
 * @returns Cached or freshly converted JSON Schema
 */
export function cachedZodToJsonSchema(schema, cacheKey) {
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
export function clearSchemaCache() {
    schemaCache.clear();
}
/**
 * Get the current schema cache size.
 */
export function getSchemaCacheSize() {
    return schemaCache.size;
}
//# sourceMappingURL=zod-to-json-schema.js.map