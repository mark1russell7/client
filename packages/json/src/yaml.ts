/**
 * YAML to JSON and back, with the `yaml` package (YAML 1.2, the core schema).
 *
 * - The parse gives only JSON values. A value that JSON does not have (`.inf`, `.nan`) is an
 *   error. The explicit YAML 1.1 tags (`!!binary`, `!!timestamp`, `!!set`) give their text.
 * - A key of a map that is a number, a boolean or null becomes its text. A key that is a map or a
 *   list is an error.
 * - The parse refuses more than 100 aliases (a resource attack) and a duplicate key.
 * - Each object of the result has own data properties only, so a key `__proto__` stays data.
 * - The text of a value is YAML 1.2 that a YAML 1.1 reader reads as the same value.
 */

import { Document, parseAllDocuments, parseDocument, Scalar, Schema, visit } from "yaml";
import { formatPointer, JsonError, put, type JsonValue } from "./value.js";

/** The options of the parse. */
export interface YamlParseOptions {
  /** True: the text can have more than one document, and the result is the list of documents. */
  readonly all?: boolean | undefined;
}

/** The options of the text. */
export interface YamlStringifyOptions {
  /** The spaces of one level of indentation: 1 to 8. The default is 2. */
  readonly indent?: number | undefined;
  /** The longest line before a fold. 0: no fold. The default is 80. */
  readonly lineWidth?: number | undefined;
  /** True: the keys of each map in alphabetical order. The default keeps the order of the value. */
  readonly sortKeys?: boolean | undefined;
}

// The log level "error" keeps the error of a second document, and prints nothing
const PARSE_OPTIONS = { version: "1.2", schema: "core", resolveKnownTags: false, uniqueKeys: true, logLevel: "error", prettyErrors: true } as const;

/** The byte order mark. */
const BOM = String.fromCharCode(0xfeff);

/** The JSON value of a value of the parse. */
function toJson(value: unknown, tokens: (string | number)[]): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new JsonError("INVALID_YAML", `yaml.parse: the value at "${formatPointer(tokens)}" is ${String(value)}, which JSON does not have`);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => toJson(item, [...tokens, index]));
  if (value instanceof Map) {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of value) {
      if (key !== null && typeof key === "object") {
        throw new JsonError("INVALID_YAML", `yaml.parse: a key at "${formatPointer(tokens)}" is a map or a list, which JSON does not have`);
      }
      const name = key === null ? "null" : String(key);
      put(out, name, toJson(item, [...tokens, name]));
    }
    return out;
  }
  throw new JsonError("INVALID_YAML", `yaml.parse: the value at "${formatPointer(tokens)}" is not a JSON value`);
}

/** The JSON value of one document, or the error of its first problem. */
function documentValue(document: Document.Parsed, index: number | undefined): JsonValue {
  const label = index === undefined ? "yaml.parse" : `yaml.parse, document ${index}`;
  const problem = document.errors[0];
  if (problem) throw new JsonError("INVALID_YAML", `${label}: ${problem.message}`);
  let value: unknown;
  try {
    value = document.toJS({ mapAsMap: true, maxAliasCount: 100 });
  } catch (error) {
    throw new JsonError("INVALID_YAML", `${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return toJson(value === undefined ? null : value, []);
}

/** This function parses YAML text into a JSON value. Bad YAML throws `INVALID_YAML`. */
export function parseYaml(text: string, options: YamlParseOptions = {}): JsonValue {
  if (options.all) return parseAllDocuments(text, PARSE_OPTIONS).map((document, index) => {
    if (!("errors" in document) || !("toJS" in document)) throw new JsonError("INVALID_YAML", "yaml.parse: the text is not YAML");
    return documentValue(document, index);
  });
  return documentValue(parseDocument(text, PARSE_OPTIONS), undefined);
}

/**
 * The plain scalars that a YAML 1.1 reader takes as a boolean, a null, a number, a date, a merge
 * key or a value key. YAML 1.2 reads them as strings, so a 1.2 writer does not quote them.
 */
const YAML_1_1_TYPES: readonly RegExp[] = [
  /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/,
  /^(?:~|null|Null|NULL)$/,
  /^[-+]?(?:0b[01_]+|0[0-7_]+|0|[1-9][0-9_]*|0x[0-9a-fA-F_]+|[1-9][0-9_]*(?::[0-5]?[0-9])+)$/,
  /^[-+]?(?:(?:[0-9][0-9_]*)?\.[0-9._]*(?:[eE][-+]?[0-9]+)?|[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|\.(?:inf|Inf|INF))$/,
  /^\.(?:nan|NaN|NAN)$/,
  /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}/,
  /^(?:<<|=)$/,
  // The YAML 1.1 schema of the yaml package reads more forms: "e0" is a float there
  ...new Schema({ schema: "yaml-1.1" }).tags.flatMap((tag) =>
    tag.default === true && tag.tag !== "tag:yaml.org,2002:str" && "test" in tag && tag.test instanceof RegExp ? [tag.test] : [],
  ),
];

/**
 * This function writes a JSON value as YAML text. The text is YAML 1.2, and a YAML 1.1 reader
 * reads the same value: a string that YAML 1.1 takes as another type (`yes`, `no`, `on`, a
 * date, `0777`, `1_000`) is in double quotes.
 */
export function stringifyYaml(value: JsonValue, options: YamlStringifyOptions = {}): string {
  const document = new Document(value, {
    version: "1.2",
    schema: "core",
    sortMapEntries: options.sortKeys ?? false,
    aliasDuplicateObjects: false,
  });
  visit(document, {
    Scalar(_key, node) {
      const text = node.value;
      if (typeof text !== "string") return;
      // A byte order mark at the start of a line is removed by a parser: it must be an escape.
      // yaml 2.9.1 writes a block scalar whose first line has only spaces wrongly: " \n" came
      // back as "\n", and " \nb" was not valid YAML. Double quotes keep such a text.
      const blockRisk = /[\n\r]/.test(text) && /(^|[\n\r])[ \t]/.test(text);
      if (blockRisk || text.includes(BOM) || YAML_1_1_TYPES.some((type) => type.test(text))) node.type = Scalar.QUOTE_DOUBLE;
    },
  });
  // Each byte order mark is in a string in double quotes, where the escape has the same value
  return document.toString({ indent: options.indent ?? 2, lineWidth: options.lineWidth ?? 80 }).replaceAll(BOM, "\\uFEFF");
}
