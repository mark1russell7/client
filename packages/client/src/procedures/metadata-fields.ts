/**
 * The types of the metadata fields that the framework reads (`ProcedureMetadata`).
 *
 * `register()` applies the schema to each procedure, from code, from `procedure.define` or from a
 * store. So a field with a wrong type stops at the registry, before a reader gets it:
 * `procedure.list` reads `description` and `tags` with its output schema, the MCP tools read
 * `description` as a text, and the call policy reads `tags` as a list. The input schema of
 * `procedure.define` uses the same schema. A custom field keeps any value: the framework does not
 * read it. The registry examines `calls` and `toolHints` with their own rules.
 */

import * as z from "zod";

/** A list of names: a JSON array of strings. */
const nameList = z.array(z.string());

/** The schema of the typed fields of `ProcedureMetadata`. Another field keeps any value. */
export const procedureMetadataFields: z.ZodType<Record<string, unknown>> = z.looseObject({
  description: z.string().optional().describe("A text that tells people and tools what the procedure does"),
  tags: nameList.optional().describe("The tags of the procedure"),
  title: z.string().optional().describe("The short name of the procedure, for example the title of an MCP tool"),
  deprecated: z.boolean().optional().describe("True when the procedure is deprecated"),
  deprecationMessage: z.string().optional().describe("The steps that replace a deprecated procedure"),
  effects: z
    .looseObject({
      reads: nameList.optional(),
      writes: nameList.optional(),
      idempotent: z.boolean().optional(),
      destructive: z.boolean().optional(),
    })
    .optional()
    .describe("The side effects of the procedure"),
  stream: z.looseObject({ unbounded: z.boolean().optional() }).optional().describe("The stream of the procedure"),
  untrusted: nameList.optional().describe("The output fields that hold text from outside the host"),
  fsRoot: z
    .looseObject({
      cwd: z.string().optional(),
      paths: nameList.optional(),
      names: nameList.optional(),
      required: nameList.optional(),
      values: nameList.optional(),
      refuse: z.string().optional(),
      program: z.boolean().optional(),
    })
    .optional()
    .describe("The rules of the procedure under a root of the files"),
});

/**
 * This function gives the refusal of metadata whose typed fields have a wrong type, or undefined.
 * The refusal names the first wrong field.
 */
export function metadataFieldRefusal(metadata: unknown): string | undefined {
  if (metadata === undefined) return undefined;
  const result = procedureMetadataFields.safeParse(metadata);
  if (result.success) return undefined;
  const issue = result.error.issues[0];
  const field = z.core.toDotPath(["metadata", ...(issue?.path ?? [])]);
  return `The field ${field} has a wrong type: ${issue?.message ?? "the value does not match its type"}`;
}
