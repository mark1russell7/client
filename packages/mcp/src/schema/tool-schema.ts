/**
 * The input JSON Schema of an MCP tool.
 *
 * The JSON Schema comes from `jsonSchemaOf()` of the core, which reads any Standard Schema
 * (zod 4 and other libraries). Before, this file converted schemas with the zod 3 library
 * `zod-to-json-schema`, and a schema without zod 3 fields got an empty object schema.
 */

import { jsonSchemaOf, type ProcedureSchema } from "@mark1russell7/client";
import type { JsonSchema } from "../types.js";

/**
 * A schema of a procedure.
 * @deprecated Use `ProcedureSchema` of `@mark1russell7/client`.
 */
export interface SchemaLike {
  parse?(data: unknown): unknown;
  safeParse?(data: unknown): { success: boolean; data?: unknown; error?: unknown };
}

/**
 * Options for the conversion.
 * @deprecated The options are not used. The core gives draft-07 JSON Schema without definitions.
 */
export interface ZodToJsonSchemaOptions {
  /** Name for the schema (not used) */
  name?: string;
  /** Pre-existing definitions (not used) */
  definitions?: Record<string, unknown>;
}

/** The input schema of a tool that takes any arguments. */
const ANY_OBJECT: JsonSchema = { type: "object", additionalProperties: true };

/**
 * The input JSON Schema of a tool for a procedure schema.
 *
 * MCP passes the arguments of a tool as an object, so an input that is not an object (a
 * pass-through schema, a schema with no JSON Schema, a number) gives an object schema that
 * accepts any field.
 */
export function toolInputSchema(schema: ProcedureSchema | unknown): JsonSchema {
  const json = jsonSchemaOf(schema as ProcedureSchema, { io: "input" });
  if (json && json["type"] === "object") {
    return json as JsonSchema;
  }
  return { ...ANY_OBJECT };
}

/**
 * The input JSON Schema of a tool.
 * @deprecated Use `toolInputSchema` (the schema need not be zod), or `jsonSchemaOf` of
 * `@mark1russell7/client` for the JSON Schema of any input or output.
 */
export function zodToJsonSchema(schema: SchemaLike | unknown, _options?: ZodToJsonSchemaOptions): JsonSchema {
  return toolInputSchema(schema);
}

// Schema cache for performance, keyed by the schema object: a procedure that is registered
// again with a different schema gets the new JSON Schema (BUGS-2026-07 L30: the cache was keyed
// by the procedure path and returned the old schema)
const schemaCache = new Map<object, JsonSchema>();

/**
 * The input JSON Schema of a tool, cached by the schema object.
 *
 * @param schema - The input schema of the procedure
 * @param _cacheKey - Not used any more (kept for compatibility): the schema object is the key
 */
export function cachedToolInputSchema(schema: ProcedureSchema | unknown, _cacheKey?: string): JsonSchema {
  if (!schema || typeof schema !== "object") {
    return toolInputSchema(schema);
  }
  const cached = schemaCache.get(schema);
  if (cached) {
    return cached;
  }
  const jsonSchema = toolInputSchema(schema);
  schemaCache.set(schema, jsonSchema);
  return jsonSchema;
}

/**
 * The output JSON Schema of a tool (MCP structured output), or `undefined`.
 *
 * MCP needs an object at the root of an output schema, and a client can check each structured
 * result against it. So only an output whose JSON Schema is an object gives one: a pass-through
 * schema, a union (a stream of items) or a number gives none, and the tool gives text only.
 */
export function toolOutputSchema(schema: ProcedureSchema | unknown): JsonSchema | undefined {
  const json = jsonSchemaOf(schema as ProcedureSchema, { io: "output" });
  return json && json["type"] === "object" ? (json as JsonSchema) : undefined;
}

// The output schemas, cached by the schema object like the input schemas. `null` keeps "no
// output schema", so the check runs once for each schema.
const outputSchemaCache = new Map<object, JsonSchema | null>();

/** The output JSON Schema of a tool, cached by the schema object. */
export function cachedToolOutputSchema(schema: ProcedureSchema | unknown): JsonSchema | undefined {
  if (!schema || typeof schema !== "object") {
    return toolOutputSchema(schema);
  }
  const cached = outputSchemaCache.get(schema);
  if (cached !== undefined) {
    return cached ?? undefined;
  }
  const jsonSchema = toolOutputSchema(schema);
  outputSchemaCache.set(schema, jsonSchema ?? null);
  return jsonSchema;
}

/**
 * The input JSON Schema of a tool, cached.
 * @deprecated Use `cachedToolInputSchema`.
 */
export function cachedZodToJsonSchema(schema: SchemaLike | unknown, cacheKey?: string): JsonSchema {
  return cachedToolInputSchema(schema, cacheKey);
}

/**
 * Clear the schema cache.
 * Useful when procedures are re-registered with different schemas.
 */
export function clearSchemaCache(): void {
  schemaCache.clear();
  outputSchemaCache.clear();
}

/**
 * Get the current schema cache size.
 */
export function getSchemaCacheSize(): number {
  return schemaCache.size;
}
