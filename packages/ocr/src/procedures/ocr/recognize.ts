/**
 * The recognition of one image by the engine, with the optional turn of a page on its side.
 */

import type { ProcedureContext } from "@procedures/client";
import type { OcrOrientation } from "../../osd.js";
import type { OcrRunner } from "../../run.js";
import { type OcrText, turnText } from "../../text.js";

/** The options of one recognition. */
export interface RecognizeOptions {
  readonly language?: string | undefined;
  readonly psm?: number | undefined;
  readonly dpi?: number | undefined;
  /** When true, the engine finds the orientation first, and the boxes are in the frame of the upright page. */
  readonly upright?: boolean | undefined;
  readonly timeout: number;
}

/** The text of one image, in pixels, and the orientation when the options ask for the upright page. */
export interface Recognition {
  readonly text: OcrText;
  readonly orientation?: OcrOrientation | undefined;
}

/**
 * This function reads the text of one image. `image` is an absolute path. With `upright`, the
 * engine finds the orientation of the page first. The engine then reads a page on its side in the
 * mode of its orientation step, unless the options give a mode. Then each box is turned into the
 * frame of the upright page.
 */
export async function recognize(runner: OcrRunner, image: string, options: RecognizeOptions, ctx: Pick<ProcedureContext, "client">): Promise<Recognition> {
  const { engine } = runner;
  const read = async (psm: number | undefined): Promise<OcrText> => {
    const argv = engine.argv(image, { language: options.language, psm, dpi: options.dpi });
    return engine.parse(await runner.run(engine.program, argv, options.timeout, ctx));
  };
  if (options.upright !== true) return { text: await read(options.psm) };

  const step = engine.orientation;
  if (step === undefined) throw new Error(`The OCR engine ${engine.name} cannot find the orientation of a page`);
  const orientation = step.parse(await runner.run(engine.program, step.argv(image, { dpi: options.dpi }), options.timeout, ctx));
  if (orientation.turn === 0) return { text: await read(options.psm), orientation };
  return { text: turnText(await read(options.psm ?? step.psm), orientation.turn), orientation };
}
