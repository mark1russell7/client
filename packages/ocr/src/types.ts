/**
 * The input and the output of the procedures of this package.
 */

import * as z from "zod";
import { LANGUAGE_PATTERN } from "./engine.js";
import type { OcrText } from "./text.js";

// =============================================================================
// The shared parts
// =============================================================================

const BoxSchema = z.object({
  x: z.number().describe("The left side of the box"),
  y: z.number().describe("The top side of the box (the y axis points down)"),
  w: z.number().describe("The width of the box"),
  h: z.number().describe("The height of the box"),
});

const WordSchema = z.object({
  text: z.string().describe("The text of the word"),
  confidence: z.number().min(0).max(1).describe("The confidence, from 0 to 1"),
  box: BoxSchema,
});

const LineSchema = z.object({
  text: z.string().describe("The words of the line, with one space between each two words"),
  confidence: z.number().min(0).max(1).describe("The mean confidence of the words, from 0 to 1"),
  box: BoxSchema,
  words: z.array(WordSchema),
});

const textFields = {
  unit: z.enum(["px", "pt"]).describe("The unit of the boxes: px is a pixel of the image, pt is a point of the PDF page"),
  width: z.number().describe("The width of the page or of the image"),
  height: z.number().describe("The height of the page or of the image"),
  text: z.string().describe("The text of the lines, with one line end between each two lines"),
  confidence: z.number().min(0).max(1).describe("The mean confidence of all words, from 0 to 1"),
  lines: z.array(LineSchema),
};

const engineFields = {
  language: z.string().regex(LANGUAGE_PATTERN, "a language name of the engine, for example eng or eng+deu").optional().describe("The language of the text (default: eng)"),
  psm: z.number().int().min(0).max(13).optional().describe("The page segmentation mode of tesseract, from 0 to 13"),
  timeout: z.number().int().positive().optional().describe("The time limit of each program, in milliseconds (default: 120000)"),
};

// =============================================================================
// ocr.page: the text of a PDF page
// =============================================================================

/** How `ocr.page` gets the text: `auto` uses OCR only for a page with no text layer. */
export type OcrPageMode = "auto" | "text" | "ocr";

/** The input of `ocr.page`. */
export interface OcrPageInput {
  file: string;
  page?: number | undefined;
  mode?: OcrPageMode | undefined;
  language?: string | undefined;
  psm?: number | undefined;
  dpi?: number | undefined;
  timeout?: number | undefined;
}

export const OcrPageInputSchema: z.ZodType<OcrPageInput> = z.object({
  file: z.string().min(1).describe("The path of the PDF file"),
  page: z.number().int().min(1).optional().describe("The number of the page, from 1 (default: 1)"),
  mode: z
    .enum(["auto", "text", "ocr"])
    .optional()
    .describe("auto: the text layer, else OCR. text: only the text layer. ocr: always OCR (default: auto)"),
  dpi: z.number().int().min(72).max(1200).optional().describe("The resolution of the image of the page for OCR, in dots per inch (default: 300)"),
  ...engineFields,
});

/** The output of `ocr.page`. The boxes are in PDF points. */
export interface OcrPageOutput extends OcrText {
  /** The number of the page. */
  readonly page: number;
  /** Where the text comes from: the text layer of the page, or OCR of an image of the page. */
  readonly source: "text-layer" | "ocr";
  /** The OCR engine, when the source is `ocr`. */
  readonly engine?: string | undefined;
}

export const OcrPageOutputSchema: z.ZodType<OcrPageOutput> = z.object({
  page: z.number().describe("The number of the page"),
  source: z.enum(["text-layer", "ocr"]).describe("Where the text comes from: the text layer, or OCR of an image of the page"),
  engine: z.string().optional().describe("The OCR engine, when the source is ocr"),
  ...textFields,
});

// =============================================================================
// ocr.image: the text of an image
// =============================================================================

/** The input of `ocr.image`. */
export interface OcrImageInput {
  file: string;
  language?: string | undefined;
  psm?: number | undefined;
  dpi?: number | undefined;
  timeout?: number | undefined;
}

export const OcrImageInputSchema: z.ZodType<OcrImageInput> = z.object({
  file: z.string().min(1).describe("The path of the image file, for example a PNG, JPEG or TIFF file"),
  dpi: z.number().int().min(1).max(4800).optional().describe("The resolution of the image, when the file does not tell it"),
  ...engineFields,
});

/** The output of `ocr.image`. The boxes are in the pixels of the image. */
export interface OcrImageOutput extends OcrText {
  /** The OCR engine. */
  readonly engine: string;
}

export const OcrImageOutputSchema: z.ZodType<OcrImageOutput> = z.object({
  engine: z.string().describe("The OCR engine"),
  ...textFields,
});
