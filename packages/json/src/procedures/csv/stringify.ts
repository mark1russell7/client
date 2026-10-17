/**
 * csv.stringify procedure
 *
 * Write rows as CSV text (RFC 4180). The rows are all arrays or all objects. `csv.parse` of the
 * text gives the rows again.
 */

import { stringifyCsv, type CsvCell } from "../../csv.js";
import type { CsvStringifyInput, CsvStringifyOutput } from "../../types.js";

/**
 * Write rows as CSV text
 */
export async function csvStringify(input: CsvStringifyInput): Promise<CsvStringifyOutput> {
  // stringifyCsv examines each row and each field
  const rows = input.rows as readonly (readonly CsvCell[])[];
  return {
    text: stringifyCsv(rows, {
      delimiter: input.delimiter,
      columns: input.columns,
      header: input.header,
      lineBreak: input.lineBreak,
    }),
  };
}
