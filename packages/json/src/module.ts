/**
 * The procedures of @procedures/json as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/json
 *
 * Each procedure is pure (`PURE_EFFECTS`): its output comes from its input, and it reads and
 * changes nothing else (roadmap R39).
 */

import { z } from "zod";
import { defineModule, registerModules, PROCEDURE_REGISTRY, PURE_EFFECTS, type ProcedureModule, type ProcedureRegistry, createProcedure, zodAdapter } from "@procedures/client";
import { jsonQuery } from "./procedures/json/query.js";
import { jsonPatch } from "./procedures/json/patch.js";
import { jsonDiff } from "./procedures/json/diff.js";
import { jsonMerge } from "./procedures/json/merge.js";
import { jsonValidate } from "./procedures/json/validate.js";
import { yamlParse } from "./procedures/yaml/parse.js";
import { yamlStringify } from "./procedures/yaml/stringify.js";
import { csvParse } from "./procedures/csv/parse.js";
import { csvStringify } from "./procedures/csv/stringify.js";
import type {
  CsvParseInput,
  CsvParseOutput,
  CsvStringifyInput,
  CsvStringifyOutput,
  JsonDiffInput,
  JsonDiffOutput,
  JsonMergeInput,
  JsonMergeOutput,
  JsonPatchInput,
  JsonPatchOutput,
  JsonQueryInput,
  JsonQueryOutput,
  JsonValidateInput,
  JsonValidateOutput,
  YamlParseInput,
  YamlParseOutput,
  YamlStringifyInput,
  YamlStringifyOutput,
} from "./types.js";

// =============================================================================
// Schemas
// =============================================================================

/** A JSON value. The handler examines it, so a key `__proto__` of the data reaches the check. */
const json = (description: string) => z.unknown().describe(description);

const operation = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]).describe("The operation"),
  path: z.string().describe("The JSON Pointer of the location"),
  from: z.string().optional().describe("The JSON Pointer of the source of move and copy"),
  value: json("The value of add, replace and test").optional(),
});

const JsonQueryInputSchema = z.object({
  value: json("The JSON value to search"),
  pointer: z.string().optional().describe("A JSON Pointer (RFC 6901), for example /items/0/name. Give pointer or path"),
  path: z.string().optional().describe("A path query, for example items[*].name or $..id. Give pointer or path"),
});

const JsonQueryOutputSchema = z.object({
  found: z.boolean().describe("True when one or more values match"),
  value: json("The value of the first match").optional(),
  matches: z.array(z.object({ pointer: z.string().describe("The JSON Pointer of the match"), value: json("The value of the match") })).describe("Each match, in document order"),
});

const JsonPatchInputSchema = z.object({
  value: json("The JSON value to change"),
  patch: z.array(operation).describe("The operations of the JSON Patch (RFC 6902), in order"),
});

const JsonPatchOutputSchema = z.object({ value: json("The value after the patch") });

const JsonDiffInputSchema = z.object({
  from: json("The first JSON value"),
  to: json("The second JSON value"),
});

const JsonDiffOutputSchema = z.object({
  patch: z.array(operation).describe("The JSON Patch (RFC 6902) that changes from into to"),
});

const JsonMergeInputSchema = z.object({
  target: json("The JSON value to change"),
  patch: json("The merge patch (RFC 7386): an object of changes, where null removes a key"),
});

const JsonMergeOutputSchema = z.object({ value: json("The value after the merge") });

const JsonValidateInputSchema = z.object({
  value: json("The JSON value to examine"),
  schema: json("The JSON Schema: an object or a boolean"),
});

const JsonValidateOutputSchema = z.object({
  valid: z.boolean().describe("True when the check found no problem"),
  errors: z.array(z.object({ pointer: z.string().describe("The JSON Pointer of the part"), message: z.string().describe("The problem") })).describe("Each problem"),
  unchecked: z.array(z.string()).describe("The keywords of the schema that the check does not examine. Empty: the verdict is complete"),
});

const YamlParseInputSchema = z.object({
  text: z.string().describe("The YAML text"),
  all: z.boolean().optional().describe("True: the text can have more than one document, and value is the list of documents"),
});

const YamlParseOutputSchema = z.object({ value: json("The JSON value of the text") });

const YamlStringifyInputSchema = z.object({
  value: json("The JSON value to write"),
  indent: z.number().int().min(1).max(8).optional().describe("The spaces of one level of indentation (default: 2)"),
  lineWidth: z.number().int().min(0).optional().describe("The longest line before a fold. 0: no fold (default: 80)"),
  sortKeys: z.boolean().optional().describe("True: the keys of each map in alphabetical order"),
});

const YamlStringifyOutputSchema = z.object({ text: z.string().describe("The YAML text") });

const delimiter = z.string().length(1).optional().describe("The character between two fields (default: a comma)");

const CsvParseInputSchema = z.object({
  text: z.string().describe("The CSV text (RFC 4180)"),
  header: z.boolean().optional().describe("True: the first row has the names of the columns, and each other row is an object"),
  delimiter,
  trim: z.boolean().optional().describe("True: remove the white space at the start and at the end of each field"),
  skipEmptyLines: z.boolean().optional().describe("False: an empty line gives a row with one empty field (default: true, skip each empty line)"),
});

// The schema does not copy the rows, so a column `__proto__` stays data. The handler gives the type of the rows
const CsvParseOutputSchema = z.object({
  rows: z.array(json("A row: an array of fields, or with header an object of fields by column name")).describe("The rows, in the order of the text"),
}) as z.ZodType<CsvParseOutput>;

const CsvStringifyInputSchema = z.object({
  rows: z.array(json("A row: an array of fields, or an object of fields by column name")).describe("The rows: all arrays or all objects. A field is a string, a number, a boolean or null"),
  columns: z.array(z.string()).optional().describe("The names of the columns. For objects, they select the keys and give their order. For arrays, they are the first row"),
  header: z.boolean().optional().describe("False: no row with the names of the columns (default: true)"),
  delimiter,
  lineBreak: z.enum(["\r\n", "\n"]).optional().describe("The line break after each row (default: CRLF)"),
});

const CsvStringifyOutputSchema = z.object({ text: z.string().describe("The CSV text") });

// =============================================================================
// Procedures
// =============================================================================

const jsonQueryProcedure = createProcedure()
  .path(["json", "query"])
  .input(zodAdapter<JsonQueryInput>(JsonQueryInputSchema))
  .output(zodAdapter<JsonQueryOutput>(JsonQueryOutputSchema))
  .meta({
    description: "Find the values at a JSON Pointer or a path in a JSON value",
    args: [],
    shorts: { pointer: "p" },
    output: "json",
    effects: PURE_EFFECTS,
  })
  .handler(async (input: JsonQueryInput): Promise<JsonQueryOutput> => jsonQuery(input))
  .build();

const jsonPatchProcedure = createProcedure()
  .path(["json", "patch"])
  .input(zodAdapter<JsonPatchInput>(JsonPatchInputSchema))
  .output(zodAdapter<JsonPatchOutput>(JsonPatchOutputSchema))
  .meta({
    description: "Apply an RFC 6902 JSON Patch to a JSON value",
    args: [],
    shorts: {},
    output: "json",
    effects: PURE_EFFECTS,
  })
  .handler(async (input: JsonPatchInput): Promise<JsonPatchOutput> => jsonPatch(input))
  .build();

const jsonDiffProcedure = createProcedure()
  .path(["json", "diff"])
  .input(zodAdapter<JsonDiffInput>(JsonDiffInputSchema))
  .output(zodAdapter<JsonDiffOutput>(JsonDiffOutputSchema))
  .meta({
    description: "Give the RFC 6902 JSON Patch that changes one JSON value into another",
    args: [],
    shorts: {},
    output: "json",
    effects: PURE_EFFECTS,
  })
  .handler(async (input: JsonDiffInput): Promise<JsonDiffOutput> => jsonDiff(input))
  .build();

const jsonMergeProcedure = createProcedure()
  .path(["json", "merge"])
  .input(zodAdapter<JsonMergeInput>(JsonMergeInputSchema))
  .output(zodAdapter<JsonMergeOutput>(JsonMergeOutputSchema))
  .meta({
    description: "Apply an RFC 7386 JSON merge patch to a JSON value",
    args: [],
    shorts: {},
    output: "json",
    effects: PURE_EFFECTS,
  })
  .handler(async (input: JsonMergeInput): Promise<JsonMergeOutput> => jsonMerge(input))
  .build();

const jsonValidateProcedure = createProcedure()
  .path(["json", "validate"])
  .input(zodAdapter<JsonValidateInput>(JsonValidateInputSchema))
  .output(zodAdapter<JsonValidateOutput>(JsonValidateOutputSchema))
  .meta({
    description: "Examine a JSON value against a JSON Schema",
    args: [],
    shorts: {},
    output: "json",
    effects: PURE_EFFECTS,
  })
  .handler(async (input: JsonValidateInput): Promise<JsonValidateOutput> => jsonValidate(input))
  .build();

const yamlParseProcedure = createProcedure()
  .path(["yaml", "parse"])
  .input(zodAdapter<YamlParseInput>(YamlParseInputSchema))
  .output(zodAdapter<YamlParseOutput>(YamlParseOutputSchema))
  .meta({
    description: "Parse YAML text into a JSON value",
    args: ["text"],
    shorts: { all: "a" },
    output: "json",
    effects: PURE_EFFECTS,
  })
  .handler(async (input: YamlParseInput): Promise<YamlParseOutput> => yamlParse(input))
  .build();

const yamlStringifyProcedure = createProcedure()
  .path(["yaml", "stringify"])
  .input(zodAdapter<YamlStringifyInput>(YamlStringifyInputSchema))
  .output(zodAdapter<YamlStringifyOutput>(YamlStringifyOutputSchema))
  .meta({
    description: "Write a JSON value as YAML text",
    args: [],
    shorts: { indent: "i", sortKeys: "s" },
    output: "json",
    effects: PURE_EFFECTS,
  })
  .handler(async (input: YamlStringifyInput): Promise<YamlStringifyOutput> => yamlStringify(input))
  .build();

const csvParseProcedure = createProcedure()
  .path(["csv", "parse"])
  .input(zodAdapter<CsvParseInput>(CsvParseInputSchema))
  .output(zodAdapter<CsvParseOutput>(CsvParseOutputSchema))
  .meta({
    description: "Parse CSV text into rows",
    args: ["text"],
    shorts: { delimiter: "d", trim: "t" },
    output: "json",
    effects: PURE_EFFECTS,
  })
  .handler(async (input: CsvParseInput): Promise<CsvParseOutput> => csvParse(input))
  .build();

const csvStringifyProcedure = createProcedure()
  .path(["csv", "stringify"])
  .input(zodAdapter<CsvStringifyInput>(CsvStringifyInputSchema))
  .output(zodAdapter<CsvStringifyOutput>(CsvStringifyOutputSchema))
  .meta({
    description: "Write rows as CSV text",
    args: [],
    shorts: { delimiter: "d" },
    output: "json",
    effects: PURE_EFFECTS,
  })
  .handler(async (input: CsvStringifyInput): Promise<CsvStringifyOutput> => csvStringify(input))
  .build();

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing.
 */
export const jsonModule: ProcedureModule = defineModule("@procedures/json", [
  jsonQueryProcedure,
  jsonPatchProcedure,
  jsonDiffProcedure,
  jsonMergeProcedure,
  jsonValidateProcedure,
  yamlParseProcedure,
  yamlStringifyProcedure,
  csvParseProcedure,
  csvStringifyProcedure,
]);

export default jsonModule;

/**
 * This function registers the procedures of @procedures/json in a registry. The default is the
 * global registry.
 */
export function registerJsonProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [jsonModule]);
}
