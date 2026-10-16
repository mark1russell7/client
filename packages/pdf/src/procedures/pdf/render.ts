/**
 * pdf.render procedure
 *
 * This procedure prints an HTML page to a PDF file with a headless Chromium browser that is
 * already installed.
 */

import { renderPdf, type CommandRunner } from "../../render.js";
import type { PdfRenderInput, PdfRenderOutput } from "../../types.js";

/**
 * This function prints the HTML text or the HTML file of the input to a PDF file. It gives the
 * path and the size of the file.
 */
export async function pdfRender(
  input: PdfRenderInput,
  ctx?: { signal?: AbortSignal | undefined },
  runner?: CommandRunner
): Promise<PdfRenderOutput> {
  const result = await renderPdf({
    html: input.html,
    file: input.file,
    output: input.output,
    executable: input.executable,
    args: input.args,
    timeout: input.timeout,
    signal: ctx?.signal,
    runner,
  });
  return { path: result.path, bytes: result.bytes, browser: result.browser };
}
