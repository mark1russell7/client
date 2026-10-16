/**
 * The input and the output of the procedures of this package.
 */

import { z } from "zod";

// =============================================================================
// pdf.render: HTML to a PDF file with a headless Chromium browser
// =============================================================================

/** The input of `pdf.render`. Give `html` or `file`, not the two. */
export interface PdfRenderInput {
  html?: string | undefined;
  file?: string | undefined;
  output?: string | undefined;
  executable?: string | undefined;
  args?: string[] | undefined;
  timeout?: number | undefined;
}

export const PdfRenderInputSchema: z.ZodType<PdfRenderInput> = z
  .object({
    html: z.string().optional().describe("The HTML text of the page"),
    file: z.string().min(1).optional().describe("The path of an HTML file"),
    output: z.string().min(1).optional().describe("The path of the PDF file (default: a file in a new temporary folder)"),
    executable: z.string().min(1).optional().describe("The browser program (default: PDF_BROWSER, CHROME_PATH, then a search)"),
    args: z.array(z.string()).optional().describe("More flags for the browser, for example --no-sandbox"),
    timeout: z.number().int().positive().optional().describe("The time limit, in milliseconds (default: 60000)"),
  })
  .refine((input) => (input.html !== undefined) !== (input.file !== undefined), { message: "Give html or file, and not the two" });

/** The output of `pdf.render`. */
export interface PdfRenderOutput {
  path: string;
  bytes: number;
  browser: string;
}

export const PdfRenderOutputSchema: z.ZodType<PdfRenderOutput> = z.object({
  path: z.string().describe("The absolute path of the PDF file"),
  bytes: z.number().describe("The size of the PDF file, in bytes"),
  browser: z.string().describe("The browser program that made the file"),
});
