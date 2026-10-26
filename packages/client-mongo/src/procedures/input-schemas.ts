/**
 * The shared fields of the mongo input schemas (roadmap 2.1).
 *
 * Each `mongo.*` tool describes its fields, so Claude and `mark --help` know them. Before, most
 * tools had a pass-through schema: the tool list showed no fields, and a field name with a
 * typing error reached the handler.
 *
 * A write (`update`, `delete`) and `find`/`get` keep their own parse functions: they check the
 * target rules of deep dive DATA-4 (exactly one of `id` or `filter`, an unknown field is an
 * error, an empty filter needs `confirm`). `described()` gives such a function the JSON Schema of
 * a zod object that names the same fields.
 */

import { z } from "zod";
import { jsonSchemaOf, typed, type ZodLikeSchema } from "@procedures/client";

/** The fields that select the database and the collection. */
export function scopeFields(): { collection: z.ZodOptional<z.ZodString>; database: z.ZodOptional<z.ZodString> } {
  return {
    collection: z.string().min(1).optional().describe("The collection name. It takes the place of metadata.collection."),
    database: z.string().min(1).optional().describe("The database name (default: the database of the connection)"),
  };
}

/** A MongoDB document or a filter: an object with any fields. */
export function documentObject(): z.ZodRecord<z.ZodString, z.ZodUnknown> {
  return z.record(z.string(), z.unknown());
}

/** The fields that select the documents of a write: one `id`, or a `filter`. */
export function targetFields(): {
  filter: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  id: z.ZodOptional<z.ZodString>;
  idType: z.ZodOptional<z.ZodEnum<{ auto: "auto"; objectId: "objectId"; string: "string" }>>;
  multi: z.ZodOptional<z.ZodBoolean>;
  confirm: z.ZodOptional<z.ZodBoolean>;
} {
  return {
    filter: documentObject()
      .optional()
      .describe("The filter of the documents (give exactly one of id or filter). An empty filter needs confirm: true."),
    id: z.string().min(1).optional().describe("The id of one document (the alternative to filter)"),
    idType: idTypeField(),
    multi: z.boolean().optional().describe("Change every matching document, not only the first one"),
    confirm: z.boolean().optional().describe("Set to true to use an empty filter, which matches every document"),
  };
}

/** How to read a string id. */
export function idTypeField(): z.ZodOptional<z.ZodEnum<{ auto: "auto"; objectId: "objectId"; string: "string" }>> {
  return z
    .enum(["auto", "objectId", "string"])
    .optional()
    .describe('How to read the id: "auto" (the default: an ObjectId or a string), "objectId" or "string"');
}

/**
 * A schema whose validation is a parse function, and whose JSON Schema is the one of a zod object
 * that names the same fields.
 */
export function described<T>(parse: (data: unknown) => T, fields: z.ZodObject): ZodLikeSchema<T> {
  type Result = ReturnType<ZodLikeSchema<T>["safeParse"]>;
  const safeParse = (data: unknown): Result => {
    try {
      return { success: true, data: parse(data) };
    } catch (error) {
      const err = error as { message?: string; issues?: { message: string; path?: (string | number)[] }[]; errors?: { message: string; path?: (string | number)[] }[] };
      const message = err.message ?? "Validation failed";
      // A plain Error has no issues: its message is the one issue
      const issues = err.issues ?? err.errors;
      return { success: false, error: { message, issues: issues && issues.length > 0 ? issues : [{ message }] } };
    }
  };
  // typed<T>() gives the type and the shape. The parse function replaces its pass-through validation
  const schema = typed<T>();
  return Object.assign(schema, {
    parse: (data: unknown): T => parse(data),
    safeParse,
    "~standard": {
      ...schema["~standard"],
      validate: (value: unknown) => {
        const result = safeParse(value);
        return result.success
          ? { value: result.data }
          : { issues: (result.error.issues ?? []).map((issue) => ({ message: issue.message, path: issue.path })) };
      },
    },
    "~jsonSchema": jsonSchemaOf(fields),
  });
}
