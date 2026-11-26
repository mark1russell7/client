/**
 * ocr.pageCount procedure
 *
 * This procedure gives the number of pages of a PDF file, from `pdfinfo` of Poppler. A caller can
 * then read each page with `ocr.page`, from page 1 to this number.
 */

import { resolve } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import { parsePdfinfoPages } from "../../pdfinfo.js";
import { PDFINFO } from "../../programs.js";
import { createOcrRunner, DEFAULT_TIMEOUT_MS, type OcrRunner } from "../../run.js";
import type { OcrPageCountInput, OcrPageCountOutput } from "../../types.js";

/** This function gives the argv of `pdfinfo` for the fields of a PDF file. */
export function pdfinfoArgs(file: string): string[] {
  return [file];
}

/**
 * This function gives the number of pages of the PDF file of the input. The count comes from the
 * same Poppler programs that `ocr.page` uses, so each page from 1 to the count is a valid page of
 * `ocr.page`.
 *
 * @throws Error when the output of `pdfinfo` has no number of pages.
 */
export async function ocrPageCount(input: OcrPageCountInput, ctx: Pick<ProcedureContext, "client">, runner: OcrRunner = createOcrRunner()): Promise<OcrPageCountOutput> {
  // An absolute path does not start with "-", so the program cannot read it as a flag
  const file = resolve(input.file);
  const timeout = input.timeout ?? DEFAULT_TIMEOUT_MS;
  return { pages: parsePdfinfoPages(await runner.run(PDFINFO, pdfinfoArgs(file), timeout, ctx)) };
}
