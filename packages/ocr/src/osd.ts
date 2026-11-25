/**
 * The parse of the orientation output of tesseract (`tesseract <image> stdout --psm 0`). This file
 * starts no process and reads no file.
 *
 * The output has lines, for example `Orientation in degrees: 270`, `Rotate: 90` and
 * `Orientation confidence: 2.00`. `Rotate` is the turn in the clock direction that makes the page
 * upright.
 */

import { OCR_TURNS, type OcrTurn } from "./text.js";

/** The orientation of a page: the turn that makes it upright, and the confidence of the engine. */
export interface OcrOrientation {
  /** The turn in the clock direction that makes the page upright, in degrees. */
  readonly turn: OcrTurn;
  /**
   * The confidence of the engine in the turn. For tesseract, it is the margin of the best
   * orientation over the next orientation. It has no upper limit, and a value below 2 is weak.
   * A page with too few letters gives 0.
   */
  readonly confidence: number;
}

/** This function gives the number after `<label>:` on a line of the output, or undefined. */
function field(output: string, label: string): number | undefined {
  // The label is a fixed word of this file, so it needs no escape
  const match = new RegExp(String.raw`^\s*${label}\s*:\s*(-?[0-9.]+)\s*$`, "im").exec(output);
  if (match === null) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * This function parses the orientation output of tesseract. An output with no valid `Rotate` line
 * (for example, a page with too few letters) gives the turn 0 and the confidence 0.
 */
export function parseTesseractOsd(output: string): OcrOrientation {
  const rotate = field(output, "Rotate");
  const turn = OCR_TURNS.find((value) => value === rotate);
  if (turn === undefined) return { turn: 0, confidence: 0 };
  return { turn, confidence: Math.max(0, field(output, "Orientation confidence") ?? 0) };
}
