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

/** The type that each typed field needs, in words, by the name of the field. */
const FIELD_TYPES: Readonly<Record<string, string>> = {
  description: "a string",
  title: "a string",
  deprecationMessage: "a string",
  tags: "a list of strings",
  untrusted: "a list of strings",
  deprecated: "a boolean",
  effects: "an object: reads and writes are lists of strings, idempotent and destructive are booleans",
  stream: "an object: unbounded is a boolean",
  fsRoot: "an object: cwd and refuse are strings, paths, names, required and values are lists of strings, program is a boolean",
};

/** One typed field of metadata with a wrong type. */
export interface MetadataFieldProblem {
  /** The path of the wrong value, for example `metadata.tags`, `metadata.tags[1]` or `metadata.effects.writes`. */
  readonly field: string;
  /** The typed field that holds the wrong value, for example `metadata.effects`, or `metadata` itself. */
  readonly typedField: string;
  /** The type that the typed field needs, in words, for example `a list of strings`. */
  readonly needs: string;
  /** The text of the schema about the wrong value. */
  readonly message: string;
}

/**
 * This function gives each typed field of the metadata with a wrong type, one entry for each path.
 * It gives an empty list for metadata without a wrong type, and for undefined metadata.
 */
export function metadataFieldProblems(metadata: unknown): MetadataFieldProblem[] {
  if (metadata === undefined) return [];
  const result = procedureMetadataFields.safeParse(metadata);
  if (result.success) return [];
  const problems: MetadataFieldProblem[] = [];
  const seen = new Set<string>();
  for (const issue of result.error.issues) {
    const field = z.core.toDotPath(["metadata", ...issue.path]);
    if (seen.has(field)) continue;
    seen.add(field);
    const top = issue.path.length > 0 ? String(issue.path[0]) : undefined;
    const needs = top !== undefined ? (FIELD_TYPES[top] ?? "its type") : "an object";
    problems.push({ field, typedField: top !== undefined ? `metadata.${top}` : "metadata", needs, message: issue.message });
  }
  return problems;
}

/**
 * This function gives the refusal of metadata whose typed fields have a wrong type, or undefined.
 * The refusal names the first wrong field and the type that its typed field needs.
 */
export function metadataFieldRefusal(metadata: unknown): string | undefined {
  const [problem] = metadataFieldProblems(metadata);
  if (!problem) return undefined;
  return `The field ${problem.field} has a wrong type: ${problem.message}. The field ${problem.typedField} needs ${problem.needs}.`;
}
