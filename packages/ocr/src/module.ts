/**
 * The procedures of @procedures/ocr as data. An import of this file registers nothing. The module
 * of `@procedures/shell` is necessary for this module: each procedure starts its programs through
 * `shell.run`.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/ocr
 */

import {
  createProcedure,
  defineModule,
  definePackage,
  type AnyProcedure,
  type Effects,
  type FsRootRules,
  type PackageDefinition,
  type ProcedureContext,
  type ProcedureModule,
} from "@procedures/client";
import shellModule from "@procedures/shell/module";
import { ocrImage } from "./procedures/ocr/image.js";
import { ocrPage } from "./procedures/ocr/page.js";
import { createOcrRunner, type OcrHostOptions } from "./run.js";
import { OcrImageInputSchema, OcrImageOutputSchema, OcrPageInputSchema, OcrPageOutputSchema, type OcrImageInput, type OcrImageOutput, type OcrPageInput, type OcrPageOutput } from "./types.js";

/** The rule of the procedures under a root of the files: the file of the input is in the root. */
const FILE_IN_A_ROOT: FsRootRules = { paths: ["file"] };

/**
 * The effects of `ocr.page`. The programs read the PDF file. `pdftoppm` writes an image to a new
 * temporary folder, and the procedure removes the folder. `shell.run` reads and writes "process".
 */
const PAGE_EFFECTS: Effects = { reads: ["fs", "process"], writes: ["fs", "process"] };

/** The effects of `ocr.image`. The engine reads the image file and writes only to its standard output. */
const IMAGE_EFFECTS: Effects = { reads: ["fs", "process"], writes: ["process"] };

/**
 * This function gives the procedures of this package with the settings of the host. The settings
 * are the path of each program, the OCR engine and the folder of the temporary folders.
 */
export function createOcrProcedures(options: OcrHostOptions = {}): AnyProcedure[] {
  const runner = createOcrRunner(options);
  const page: AnyProcedure = createProcedure()
    .path(["ocr", "page"])
    .input(OcrPageInputSchema)
    .output(OcrPageOutputSchema)
    .meta({
      description: "Give the text of a PDF page with the box of each line and word: the text layer first, then OCR for a page with no text layer",
      args: ["file"],
      shorts: { page: "p", language: "l", mode: "m", timeout: "t" },
      output: "json",
      calls: ["shell.run"],
      effects: PAGE_EFFECTS,
      fsRoot: FILE_IN_A_ROOT,
    })
    .handler(async (input: OcrPageInput, ctx: ProcedureContext): Promise<OcrPageOutput> => ocrPage(input, ctx, runner))
    .build();
  const image: AnyProcedure = createProcedure()
    .path(["ocr", "image"])
    .input(OcrImageInputSchema)
    .output(OcrImageOutputSchema)
    .meta({
      description: "Read the text of an image with a local OCR engine (tesseract), with the confidence and the box of each line and word",
      args: ["file"],
      shorts: { language: "l", timeout: "t" },
      output: "json",
      calls: ["shell.run"],
      effects: IMAGE_EFFECTS,
      fsRoot: FILE_IN_A_ROOT,
    })
    .handler(async (input: OcrImageInput, ctx: ProcedureContext): Promise<OcrImageOutput> => ocrImage(input, ctx, runner))
    .build();
  return [page, image];
}

/** The procedures with the default settings: the search finds each program at each call. */
export const ocrProcedures: AnyProcedure[] = createOcrProcedures();

const ocrPackage: PackageDefinition = definePackage("@procedures/ocr", ocrProcedures, [shellModule]);

export const ocrModule: ProcedureModule = ocrPackage.module;

export default ocrModule;

/**
 * This function gives the module with the settings of the host. Without options, it gives
 * `ocrModule`.
 *
 * ```ts
 * createRegistry(createOcrModule({ executables: { tesseract: "/opt/tesseract/bin/tesseract" } }));
 * ```
 */
export function createOcrModule(options: OcrHostOptions = {}): ProcedureModule {
  if (Object.values(options).every((value) => value === undefined)) return ocrModule;
  return defineModule("@procedures/ocr", createOcrProcedures(options), [shellModule]);
}

/**
 * This function registers the procedures of @procedures/ocr in a registry. The default is the
 * global registry.
 */
export const registerOcrProcedures: PackageDefinition["register"] = ocrPackage.register;
