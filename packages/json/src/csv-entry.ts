/**
 * The entry `@procedures/json/csv`: the CSV functions without the rest of the package (roadmap O50).
 *
 * This entry exports the same functions and types as the root. Its static imports reach no
 * package: no `yaml`, no `zod` and no `@procedures/client`. Thus a program that only reads or
 * writes CSV text starts faster.
 */

export { parseCsv, stringifyCsv, type CsvCell, type CsvParseOptions, type CsvRecord, type CsvStringifyOptions } from "./csv.js";
export { csvParse, csvStringify } from "./procedures/csv/index.js";
export type { CsvParseInput, CsvParseOutput, CsvStringifyInput, CsvStringifyOutput } from "./types.js";
// The error of the CSV functions: the code `INVALID_CSV`
export { JsonError, type JsonErrorCode } from "./value.js";
