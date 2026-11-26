/**
 * The parse of the output of `pdfinfo` of Poppler. This file starts no process and reads no file.
 *
 * The output has one line for each field, for example `Title:          A report` and
 * `Pages:          3`.
 */

/**
 * This function gives the number of pages from the output of `pdfinfo`: the value of its `Pages`
 * line.
 *
 * @throws Error when the output has no `Pages` line with a whole number.
 */
export function parsePdfinfoPages(output: string): number {
  const match = /^Pages:[ \t]*([0-9]+)[ \t]*\r?$/m.exec(output);
  const pages = match === null ? Number.NaN : Number(match[1]);
  if (!Number.isSafeInteger(pages)) throw new Error("The output of pdfinfo has no Pages line with a whole number");
  return pages;
}
