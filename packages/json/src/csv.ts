/**
 * A CSV reader and writer (RFC 4180), without dependencies.
 *
 * - A field in double quotes can have the delimiter, a line break and a doubled quote (`""`).
 * - A line break is CRLF, LF or CR. A line break at the end of the text does not start a row.
 * - The parse removes a byte order mark at the start of the text.
 * - A quote in a field without quotes is a normal character, as in most readers.
 * - Each object that the parse makes has own data properties only, so a column `__proto__` stays data.
 */

import { hasOwn, isPlainObject, JsonError, put } from "./value.js";

/** A row of `parseCsv` with `header`: the fields by the names of the columns. */
export type CsvRecord = Record<string, string>;

/** A value that `stringifyCsv` writes as a field. Null and undefined give an empty field. */
export type CsvCell = string | number | boolean | null | undefined;

/** The options of `parseCsv`. */
export interface CsvParseOptions {
  /** The character between two fields. The default is a comma. */
  readonly delimiter?: string | undefined;
  /** True: the first row has the names of the columns, and each other row becomes an object. The default is false. */
  readonly header?: boolean | undefined;
  /** True: the parse removes the white space at the start and at the end of each field. The default is false. */
  readonly trim?: boolean | undefined;
  /** False: an empty line gives a row with one empty field. The default (true) skips each empty line. */
  readonly skipEmptyLines?: boolean | undefined;
}

/** The options of `stringifyCsv`. */
export interface CsvStringifyOptions {
  /** The character between two fields. The default is a comma. */
  readonly delimiter?: string | undefined;
  /**
   * The names of the columns. For rows that are objects, the names select the keys and give their
   * order. For rows that are arrays, the names are the first row.
   */
  readonly columns?: readonly string[] | undefined;
  /** False: the text has no row with the names of the columns. The default is true. */
  readonly header?: boolean | undefined;
  /** The line break after each row: `"\r\n"` (the default, as RFC 4180 tells) or `"\n"`. */
  readonly lineBreak?: "\r\n" | "\n" | undefined;
}

/** The byte order mark. */
const BOM = "﻿";

/** One row of the text, before the header. */
interface RawRow {
  readonly fields: string[];
  /** The line where the row starts, from 1. */
  readonly line: number;
  /** True for an empty line: one field without quotes and without text. */
  readonly empty: boolean;
}

/** The delimiter of the options. It is one character, and not a quote or a line break. */
function delimiterOf(delimiter: string | undefined, label: string): string {
  if (delimiter === undefined) return ",";
  if (delimiter.length !== 1 || delimiter === '"' || delimiter === "\r" || delimiter === "\n") {
    throw new JsonError("INVALID_CSV", `${label}: the delimiter ${JSON.stringify(delimiter)} must be one character, and not a quote or a line break`);
  }
  return delimiter;
}

/** The number of line breaks in a text. CRLF is one line break. */
const lineBreaks = (text: string): number => text.match(/\r\n|\r|\n/g)?.length ?? 0;

/** True for a space or a tab that is not the delimiter. */
const isBlank = (char: string | undefined, delimiter: string): boolean => (char === " " || char === "\t") && char !== delimiter;

/** This function reads the rows of a CSV text. */
function readRows(text: string, delimiter: string, trim: boolean): RawRow[] {
  const rows: RawRow[] = [];
  const end = text.length;
  let at = 0;
  let line = 1;
  while (at < end) {
    const start = line;
    const fields: string[] = [];
    let quoted = false;
    for (;;) {
      let next = at;
      if (trim) while (isBlank(text[next], delimiter)) next += 1;
      if (text[next] === '"') {
        // A field in quotes: it ends at a quote that is not doubled
        const open = line;
        let value = "";
        let from = next + 1;
        for (;;) {
          const quote = text.indexOf('"', from);
          if (quote === -1) throw new JsonError("INVALID_CSV", `csv.parse: the quote at line ${open} has no closing quote`);
          value += text.slice(from, quote);
          if (text[quote + 1] === '"') {
            value += '"';
            from = quote + 2;
          } else {
            from = quote + 1;
            break;
          }
        }
        line += lineBreaks(text.slice(next, from));
        if (trim) while (isBlank(text[from], delimiter)) from += 1;
        const after = text[from];
        if (after !== undefined && after !== delimiter && after !== "\r" && after !== "\n") {
          throw new JsonError("INVALID_CSV", `csv.parse: line ${line} has the character ${JSON.stringify(after)} after the closing quote of a field`);
        }
        fields.push(trim ? value.trim() : value);
        quoted = true;
        at = from;
      } else {
        let stop = at;
        while (stop < end && text[stop] !== delimiter && text[stop] !== "\r" && text[stop] !== "\n") stop += 1;
        const value = text.slice(at, stop);
        fields.push(trim ? value.trim() : value);
        at = stop;
      }
      if (text[at] !== delimiter) break;
      at += 1;
    }
    if (text[at] === "\r" || text[at] === "\n") {
      at += text[at] === "\r" && text[at + 1] === "\n" ? 2 : 1;
      line += 1;
    }
    rows.push({ fields, line: start, empty: fields.length === 1 && !quoted && fields[0] === "" });
  }
  return rows;
}

/** This function makes the objects of the rows with the first row as the names of the columns. */
function records(rows: readonly RawRow[]): CsvRecord[] {
  const [head, ...body] = rows;
  if (head === undefined) return [];
  const names = head.fields;
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) throw new JsonError("INVALID_CSV", `csv.parse: the header has the column ${JSON.stringify(name)} two times`);
    seen.add(name);
  }
  return body.map((row) => {
    if (row.fields.length > names.length) {
      throw new JsonError("INVALID_CSV", `csv.parse: the row at line ${row.line} has ${row.fields.length} fields, and the header has ${names.length}`);
    }
    const record: CsvRecord = {};
    names.forEach((name, index) => put(record, name, row.fields[index] ?? ""));
    return record;
  });
}

/**
 * This function parses CSV text (RFC 4180) into rows. Each row is an array of its fields. With
 * `header`, the first row gives the names of the columns, and each other row is an object. A
 * row with fewer fields gets empty text for the missing columns. Bad text throws `INVALID_CSV`.
 */
export function parseCsv(text: string, options: CsvParseOptions & { readonly header: true }): CsvRecord[];
export function parseCsv(text: string, options?: CsvParseOptions & { readonly header?: false | undefined }): string[][];
export function parseCsv(text: string, options?: CsvParseOptions): string[][] | CsvRecord[];
export function parseCsv(text: string, options: CsvParseOptions = {}): string[][] | CsvRecord[] {
  const delimiter = delimiterOf(options.delimiter, "csv.parse");
  const body = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  const skip = options.skipEmptyLines ?? true;
  const rows = readRows(body, delimiter, options.trim ?? false).filter((row) => !(skip && row.empty));
  return options.header ? records(rows) : rows.map((row) => row.fields);
}

/** The text of one field. */
function cellText(value: unknown, where: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new JsonError("INVALID_CSV", `csv.stringify: ${where} is not a string, a finite number, a boolean or null`);
}

/** The CSV form of one row. A field gets quotes when it has the delimiter, a quote or a line break. */
function rowText(cells: readonly string[], delimiter: string): string {
  // A row of one empty field gets quotes: an empty line is not a row for the parse
  if (cells.length === 1 && cells[0] === "") return '""';
  return cells
    .map((cell) => (cell.includes(delimiter) || cell.includes('"') || cell.includes("\r") || cell.includes("\n") ? `"${cell.replaceAll('"', '""')}"` : cell))
    .join(delimiter);
}

/**
 * This function writes rows as CSV text (RFC 4180). The rows are all arrays or all objects. For
 * objects, the first row has the names of the columns: by default, each key in the order that
 * the rows first give it. Each row ends with a line break. Bad rows throw `INVALID_CSV`.
 */
export function stringifyCsv(rows: readonly (readonly CsvCell[])[] | readonly Readonly<Record<string, CsvCell>>[], options: CsvStringifyOptions = {}): string {
  const delimiter = delimiterOf(options.delimiter, "csv.stringify");
  const lineBreak = options.lineBreak ?? "\r\n";
  if (lineBreak !== "\r\n" && lineBreak !== "\n") throw new JsonError("INVALID_CSV", 'csv.stringify: the line break must be "\\r\\n" or "\\n"');
  const list: readonly unknown[] = rows;
  const arrays = list.every((row) => Array.isArray(row));
  if (!arrays && !list.every((row) => isPlainObject(row))) {
    throw new JsonError("INVALID_CSV", "csv.stringify: the rows must be all arrays or all objects");
  }
  const lines: string[] = [];
  let columns = options.columns;
  if (!arrays && columns === undefined) {
    const names = new Set<string>();
    for (const row of list as readonly Record<string, unknown>[]) for (const key of Object.keys(row)) names.add(key);
    columns = [...names];
  }
  if (columns !== undefined && options.header !== false && columns.length > 0) {
    lines.push(rowText(columns.map((name, index) => cellText(name, `column ${index + 1} of the header`)), delimiter));
  }
  list.forEach((row, index) => {
    const cells = arrays
      ? (row as readonly unknown[]).map((value, column) => cellText(value, `field ${column + 1} of row ${index + 1}`))
      : (columns ?? []).map((name) => cellText(hasOwn(row as object, name) ? (row as Record<string, unknown>)[name] : undefined, `the field ${JSON.stringify(name)} of row ${index + 1}`));
    lines.push(rowText(cells, delimiter));
  });
  return lines.map((text) => text + lineBreak).join("");
}
