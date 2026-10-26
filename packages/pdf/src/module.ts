/**
 * The procedures of @procedures/pdf as data. An import of this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/pdf
 */

import {
  definePackage,
  type AnyProcedure,
  type ProcedureModule,
  createProcedure,
  type PackageDefinition,
} from "@procedures/client";
import { pdfRender } from "./procedures/pdf/render.js";
import { PdfRenderInputSchema, PdfRenderOutputSchema, type PdfRenderInput, type PdfRenderOutput } from "./types.js";

export const pdfRenderProcedure: AnyProcedure = createProcedure()
  .path(["pdf", "render"])
  .input(PdfRenderInputSchema)
  .output(PdfRenderOutputSchema)
  .meta({
    description: "Render HTML to a PDF file with a headless Chromium browser",
    args: [],
    shorts: { output: "o", timeout: "t" },
    output: "json",
    // The browser reads the page and the files and addresses that the page names. The caller can
    // choose the browser program, so the procedure writes "process". It replaces the output file.
    effects: { reads: ["fs", "network", "process"], writes: ["fs", "process"], destructive: true },
  })
  .handler(async (input: PdfRenderInput, ctx): Promise<PdfRenderOutput> => pdfRender(input, ctx))
  .build();

export const pdfProcedures: AnyProcedure[] = [pdfRenderProcedure];

const pdfPackage: PackageDefinition = definePackage("@procedures/pdf", pdfProcedures);

export const pdfModule: ProcedureModule = pdfPackage.module;

export default pdfModule;

/**
 * This function registers the procedures of @procedures/pdf in a registry. The default is the
 * global registry.
 */
export const registerPdfProcedures: PackageDefinition["register"] = pdfPackage.register;
