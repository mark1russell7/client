/**
 * HTML to PDF with a headless Chromium browser that is already installed. The render uses the
 * headless run of `run.ts`.
 */

import { headlessRender, readHead, type HeadlessOptions, type HeadlessRender, type RenderResult } from "./run.js";

/** The options of `renderPdf`. Give `html` or `file`, not the two. */
export interface RenderPdfOptions extends HeadlessOptions {
  /** The HTML text. The function writes it to a temporary file. */
  readonly html?: string | undefined;
  /** The path of an HTML file. */
  readonly file?: string | undefined;
}

/** The result of `renderPdf`: the path and the size of the PDF file, and the browser program. */
export type RenderPdfResult = RenderResult;

/**
 * This function gives the argv of the browser. The argv has the flags of a headless print, the
 * profile folder, the extra flags and the address of the page.
 */
export function pdfArgs(page: string, output: string, profile: string, extra: readonly string[] = []): string[] {
  return [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    // A separate profile keeps the print apart from a browser that the user has open
    `--user-data-dir=${profile}`,
    `--print-to-pdf=${output}`,
    ...extra,
    page,
  ];
}

/** This function tells if a file starts with the signature of a PDF file (`%PDF`). */
export function isPdfFile(path: string): boolean {
  return readHead(path, 4).toString("latin1") === "%PDF";
}

const PDF: HeadlessRender = { prefix: "procedures-pdf-", file: "page.pdf", noun: "PDF file", argv: pdfArgs, isValid: isPdfFile };

/**
 * This function prints an HTML page to a PDF file with a headless browser. It gives the path and
 * the size of the file. It throws when it finds no browser, at the time limit, and when the file
 * is not a PDF file.
 */
export async function renderPdf(options: RenderPdfOptions): Promise<RenderPdfResult> {
  const { html, file } = options;
  if ((html === undefined) === (file === undefined)) throw new Error("renderPdf needs html or file, and not the two");
  return headlessRender(PDF, html !== undefined ? { html } : { file: file! }, options);
}
