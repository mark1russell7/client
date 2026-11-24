/**
 * ocr.page procedure
 *
 * This procedure gives the text of a PDF page. It reads the text layer of the page first, with
 * `pdftotext`. Only for a page with no text layer, it makes an image of the page with `pdftoppm`
 * and reads the image with the OCR engine.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import { parsePdftotextBbox } from "../../bbox.js";
import { PDFTOPPM, PDFTOTEXT } from "../../programs.js";
import { createOcrRunner, DEFAULT_TIMEOUT_MS, type OcrRunner } from "../../run.js";
import { scaleText } from "../../text.js";
import type { OcrPageInput, OcrPageOutput } from "../../types.js";

/** The default resolution of the image of a page for OCR, in dots per inch. */
export const DEFAULT_DPI = 300;

/** The PDF points in one inch. */
const POINTS_PER_INCH = 72;

/** This function gives the argv of `pdftotext` for the text layer of one page, with the boxes. */
export function pdftotextArgs(file: string, page: number): string[] {
  return ["-f", String(page), "-l", String(page), "-bbox-layout", "-enc", "UTF-8", file, "-"];
}

/** This function gives the argv of `pdftoppm` for a PNG image of one page. The image is `<prefix>.png`. */
export function pdftoppmArgs(file: string, page: number, dpi: number, prefix: string): string[] {
  return ["-f", String(page), "-l", String(page), "-r", String(dpi), "-png", "-singlefile", file, prefix];
}

/**
 * This function gives the text of one page of the PDF file of the input. The boxes are in PDF
 * points. In the mode `auto`, a page with a word in its text layer gives the text layer. A page
 * with no word gives the text of OCR.
 */
export async function ocrPage(input: OcrPageInput, ctx: Pick<ProcedureContext, "client">, runner: OcrRunner = createOcrRunner()): Promise<OcrPageOutput> {
  // An absolute path does not start with "-", so a program cannot read it as a flag
  const file = resolve(input.file);
  const page = input.page ?? 1;
  const mode = input.mode ?? "auto";
  const timeout = input.timeout ?? DEFAULT_TIMEOUT_MS;

  // The text layer also gives the size of the page in points, so it runs in each mode
  const layer = parsePdftotextBbox(await runner.run(PDFTOTEXT, pdftotextArgs(file, page), timeout, ctx));
  if (mode === "text" || (mode === "auto" && layer.lines.length > 0)) return { page, source: "text-layer", ...layer };

  const dpi = input.dpi ?? DEFAULT_DPI;
  const { engine } = runner;
  const folder = mkdtempSync(join(runner.tempFolder ?? tmpdir(), "procedures-ocr-"));
  try {
    const prefix = join(folder, "page");
    await runner.run(PDFTOPPM, pdftoppmArgs(file, page, dpi, prefix), timeout, ctx);
    const image = `${prefix}.png`;
    if (!existsSync(image)) throw new Error(`pdftoppm made no image of page ${page}`);
    const argv = engine.argv(image, { language: input.language, psm: input.psm, dpi });
    const pixels = engine.parse(await runner.run(engine.program, argv, timeout, ctx));
    const points = scaleText(pixels, POINTS_PER_INCH / dpi, "pt");
    // The size of the page comes from the text layer, when it has one
    const size = layer.width > 0 && layer.height > 0 ? { width: layer.width, height: layer.height } : {};
    return { page, source: "ocr", engine: engine.name, ...points, ...size };
  } finally {
    removeFolder(folder);
  }
}

/**
 * This function removes the temporary folder. A removal that fails leaves the folder and does not
 * throw, so it does not hide the result or the error of the call.
 */
function removeFolder(folder: string): void {
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // The folder stays in the temporary folder of the system
  }
}
