/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here. The zod schemas are in
 * `module.ts`: an exported schema needs a written type (isolatedDeclarations).
 */

import type { PatchOperation } from "./patch.js";

export type { JsonValue } from "./value.js";
export type { PatchOperation } from "./patch.js";

// =============================================================================
// json.query Types - Find the values at a JSON Pointer or a path in a JSON value
// =============================================================================

export interface JsonQueryInput {
  /** The JSON value to search. */
  value: unknown;
  /** A JSON Pointer (RFC 6901): `/items/0/name`. Give `pointer` or `path`. */
  pointer?: string | undefined;
  /** A path query: `items[*].name`, `$..id`. Give `pointer` or `path`. */
  path?: string | undefined;
}

export interface JsonQueryOutput {
  /** True when one or more values match. */
  found: boolean;
  /** The value of the first match. */
  value?: unknown;
  /** Each match, in document order: its JSON Pointer and its value. */
  matches: Array<{ pointer: string; value?: unknown }>;
}

// =============================================================================
// json.patch Types - Apply an RFC 6902 JSON Patch to a JSON value
// =============================================================================

export interface JsonPatchInput {
  value: unknown;
  /** The operations, in order. */
  patch: PatchOperation[];
}

export interface JsonPatchOutput {
  /** The value after the patch. */
  value?: unknown;
}

// =============================================================================
// json.diff Types - Give the RFC 6902 JSON Patch that changes one JSON value into another
// =============================================================================

export interface JsonDiffInput {
  from: unknown;
  to: unknown;
}

export interface JsonDiffOutput {
  /** The operations that change `from` into `to`. Equal values give an empty list. */
  patch: PatchOperation[];
}

// =============================================================================
// json.merge Types - Apply an RFC 7386 JSON merge patch to a JSON value
// =============================================================================

export interface JsonMergeInput {
  /** The value to change. */
  target: unknown;
  /** The merge patch: an object of changes, where null removes a key. */
  patch: unknown;
}

export interface JsonMergeOutput {
  value?: unknown;
}

// =============================================================================
// json.validate Types - Examine a JSON value against a JSON Schema
// =============================================================================

export interface JsonValidateInput {
  value: unknown;
  /** The JSON Schema: an object or a boolean. */
  schema: unknown;
}

export interface JsonValidateOutput {
  valid: boolean;
  /** Each problem: the JSON Pointer of the part of the value, and a message. */
  errors: Array<{ pointer: string; message: string }>;
  /** The keywords of the schema that the check does not examine. Empty: the verdict is complete. */
  unchecked: string[];
}

// =============================================================================
// yaml.parse Types - Parse YAML text into a JSON value
// =============================================================================

export interface YamlParseInput {
  text: string;
  /** True: the text can have more than one document, and `value` is the list of documents. */
  all?: boolean | undefined;
}

export interface YamlParseOutput {
  value?: unknown;
}

// =============================================================================
// yaml.stringify Types - Write a JSON value as YAML text
// =============================================================================

export interface YamlStringifyInput {
  value: unknown;
  /** The spaces of one level of indentation: 1 to 8. The default is 2. */
  indent?: number | undefined;
  /** The longest line before a fold. 0: no fold. The default is 80. */
  lineWidth?: number | undefined;
  /** True: the keys of each map in alphabetical order. */
  sortKeys?: boolean | undefined;
}

export interface YamlStringifyOutput {
  text: string;
}

// =============================================================================
// csv.parse Types - Parse CSV text into rows
// =============================================================================

export interface CsvParseInput {
  text: string;
  /** True: the first row has the names of the columns, and each other row is an object. */
  header?: boolean | undefined;
  /** The character between two fields. The default is a comma. */
  delimiter?: string | undefined;
  /** True: the parse removes the white space at the start and at the end of each field. */
  trim?: boolean | undefined;
  /** False: an empty line gives a row with one empty field. The default skips each empty line. */
  skipEmptyLines?: boolean | undefined;
}

export interface CsvParseOutput {
  /** The rows: arrays of fields, or with `header`, objects of fields by the names of the columns. */
  rows: string[][] | Record<string, string>[];
}

// =============================================================================
// csv.stringify Types - Write rows as CSV text
// =============================================================================

export interface CsvStringifyInput {
  /** The rows: all arrays of fields, or all objects of fields by the names of the columns. */
  rows: unknown[];
  /** The names of the columns. For objects, they select the keys and give their order. For arrays, they are the first row. */
  columns?: string[] | undefined;
  /** False: the text has no row with the names of the columns. */
  header?: boolean | undefined;
  /** The character between two fields. The default is a comma. */
  delimiter?: string | undefined;
  /** The line break after each row. The default is CRLF. */
  lineBreak?: "\r\n" | "\n" | undefined;
}

export interface CsvStringifyOutput {
  text: string;
}
