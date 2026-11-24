/**
 * The adapter of an OCR engine: the program, the argv for one image and the parse of the output.
 * The adapter starts no process: the procedures start the program through `shell.run`. Tesseract
 * is the first engine. Another engine is one more adapter.
 */

import { TESSERACT, type ProgramSpec } from "./programs.js";
import { type OcrOrientation, parseTesseractOsd } from "./osd.js";
import type { OcrText } from "./text.js";
import { parseTesseractTsv } from "./tsv.js";

/** The options of one recognition. */
export interface OcrEngineOptions {
  /** The language of the text, for example `eng`, or `eng+deu` for two languages (default: `eng`). */
  readonly language?: string | undefined;
  /** The page segmentation mode of the engine. For tesseract, a value from 0 to 13. */
  readonly psm?: number | undefined;
  /** The resolution of the image, in dots per inch, when the image file does not tell it. */
  readonly dpi?: number | undefined;
}

/** The step of an engine that finds the orientation of a page. */
export interface OcrOrientationStep {
  /** This function gives the argv of the program that finds the orientation of one image. */
  argv(image: string, options: Pick<OcrEngineOptions, "dpi">): string[];
  /** This function parses the standard output of the program. */
  parse(stdout: string): OcrOrientation;
  /**
   * The page segmentation mode that reads a page on its side. The engine turns the page in this
   * mode, but it gives the boxes in the frame of the image.
   */
  readonly psm: number;
}

/** An OCR engine. */
export interface OcrEngine {
  /** The name of the engine in the result, for example `tesseract`. */
  readonly name: string;
  /** The program of the engine, for the search on the host. */
  readonly program: ProgramSpec;
  /** This function gives the argv of the program for one image. `image` is an absolute path. */
  argv(image: string, options: OcrEngineOptions): string[];
  /** This function parses the standard output of the program. The boxes are in the pixels of the image. */
  parse(stdout: string): OcrText;
  /** The step that finds the orientation of a page. An engine with no step cannot read a page on its side. */
  readonly orientation?: OcrOrientationStep | undefined;
}

/** The default language of the recognition. */
export const DEFAULT_LANGUAGE = "eng";

/**
 * The form of a language value: names of letters, digits, `_` and `/` (for example `script/Latin`),
 * joined with `+`. A value cannot start with `-`, so the program cannot read it as a flag.
 */
export const LANGUAGE_PATTERN: RegExp = /^[A-Za-z0-9_][A-Za-z0-9_/]*(\+[A-Za-z0-9_][A-Za-z0-9_/]*)*$/;

/**
 * The adapter of tesseract 4 or later. The argv is `<image> stdout -l <language> [--psm N]
 * [--dpi N] tsv`: tesseract writes the TSV of the image to the standard output. Its orientation step
 * is `<image> stdout --psm 0 [--dpi N]`.
 */
export const tesseractEngine: OcrEngine = {
  name: "tesseract",
  program: TESSERACT,
  argv(image, options) {
    const language = options.language ?? DEFAULT_LANGUAGE;
    if (!LANGUAGE_PATTERN.test(language)) throw new Error(`The language ${JSON.stringify(language)} is not a valid language name of tesseract`);
    const argv = [image, "stdout", "-l", language];
    if (options.psm !== undefined) argv.push("--psm", String(options.psm));
    if (options.dpi !== undefined) argv.push("--dpi", String(options.dpi));
    argv.push("tsv");
    return argv;
  },
  parse: parseTesseractTsv,
  orientation: {
    // The mode 0 finds only the orientation and the script. It needs the osd data of tesseract
    argv(image, options) {
      const argv = [image, "stdout", "--psm", "0"];
      if (options.dpi !== undefined) argv.push("--dpi", String(options.dpi));
      return argv;
    },
    parse: parseTesseractOsd,
    // The mode 1 finds the orientation, turns the page and then finds the blocks of the page
    psm: 1,
  },
};
