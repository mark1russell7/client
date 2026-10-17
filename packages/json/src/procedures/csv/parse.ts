/**
 * csv.parse procedure
 *
 * Parse CSV text (RFC 4180) into rows. With `header`, the first row gives the names of the
 * columns, and each other row is an object.
 */

import { parseCsv } from "../../csv.js";
import type { CsvParseInput, CsvParseOutput } from "../../types.js";

/**
 * Parse CSV text into rows
 */
export async function csvParse(input: CsvParseInput): Promise<CsvParseOutput> {
  return {
    rows: parseCsv(input.text, {
      header: input.header,
      delimiter: input.delimiter,
      trim: input.trim,
      skipEmptyLines: input.skipEmptyLines,
    }),
  };
}
