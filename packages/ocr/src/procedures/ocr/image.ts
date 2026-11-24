/**
 * ocr.image procedure
 *
 * This procedure reads the text of an image with the OCR engine of the host (tesseract first).
 */

import { resolve } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import { createOcrRunner, DEFAULT_TIMEOUT_MS, type OcrRunner } from "../../run.js";
import type { OcrImageInput, OcrImageOutput } from "../../types.js";
import { recognize } from "./recognize.js";

/**
 * This function reads the text of the image file of the input. It gives each line and each word
 * with its text, its confidence and its box, in the pixels of the image. With `upright`, the boxes
 * are in the pixels of the upright image.
 */
export async function ocrImage(input: OcrImageInput, ctx: Pick<ProcedureContext, "client">, runner: OcrRunner = createOcrRunner()): Promise<OcrImageOutput> {
  // An absolute path does not start with "-", so the engine cannot read it as a flag
  const options = { language: input.language, psm: input.psm, dpi: input.dpi, upright: input.upright, timeout: input.timeout ?? DEFAULT_TIMEOUT_MS };
  const { text, orientation } = await recognize(runner, resolve(input.file), options, ctx);
  return { engine: runner.engine.name, ...text, ...(orientation === undefined ? {} : { orientation }) };
}
