/**
 * The records of a recognized text: each word and each line with its text, its confidence and its
 * box. The box is the `Rect` record of `@mark1russell7/layout-contract`: the top-left corner and the
 * size, with the y axis down. This file starts no process and reads no file.
 */

import type { Rect } from "@mark1russell7/layout-contract";

export type { Rect };

/** The unit of the boxes: `px` is a pixel of the image, `pt` is a point of the PDF page (1/72 inch). */
export type OcrUnit = "px" | "pt";

/** One word: its text, its confidence from 0 to 1 and its box. */
export interface OcrWord {
  readonly text: string;
  /** The confidence of the engine, from 0 to 1. A word of a text layer has the confidence 1. */
  readonly confidence: number;
  readonly box: Rect;
}

/** One line: its text, its confidence, its box and its words, in the order of the line. */
export interface OcrLine {
  /** The words of the line, with one space between each two words. */
  readonly text: string;
  /** The mean confidence of the words of the line, from 0 to 1. */
  readonly confidence: number;
  readonly box: Rect;
  readonly words: readonly OcrWord[];
}

/** The text of a page or of an image, as lines of words with their boxes. */
export interface OcrText {
  /** The unit of each box, and of `width` and `height`. */
  readonly unit: OcrUnit;
  /** The width of the page or of the image. */
  readonly width: number;
  /** The height of the page or of the image. */
  readonly height: number;
  /** The text of the lines, with one line end between each two lines. */
  readonly text: string;
  /** The mean confidence of all words, from 0 to 1. A text with no word has the confidence 0. */
  readonly confidence: number;
  readonly lines: readonly OcrLine[];
}

/** This function gives the smallest box that contains each box of the list. An empty list gives the box 0, 0, 0, 0. */
export function unionBox(boxes: readonly Rect[]): Rect {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const box of boxes) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.w);
    bottom = Math.max(bottom, box.y + box.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** This function gives the mean confidence of the words, or 0 for an empty list. */
export function meanConfidence(words: readonly OcrWord[]): number {
  if (words.length === 0) return 0;
  return words.reduce((sum, word) => sum + word.confidence, 0) / words.length;
}

/**
 * This function makes a line from its words. The box of the line is `box`, else the union of the
 * boxes of the words.
 */
export function makeLine(words: readonly OcrWord[], box?: Rect): OcrLine {
  return {
    text: words.map((word) => word.text).join(" "),
    confidence: meanConfidence(words),
    box: box ?? unionBox(words.map((word) => word.box)),
    words,
  };
}

/** This function makes the text of a page or of an image from its lines. */
export function makeText(lines: readonly OcrLine[], unit: OcrUnit, width: number, height: number): OcrText {
  return {
    unit,
    width,
    height,
    text: lines.map((line) => line.text).join("\n"),
    confidence: meanConfidence(lines.flatMap((line) => line.words)),
    lines,
  };
}

/** This function rounds a value to 3 decimals, so a scale gives no long fractions. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function scaleBox(box: Rect, factor: number): Rect {
  return { x: round3(box.x * factor), y: round3(box.y * factor), w: round3(box.w * factor), h: round3(box.h * factor) };
}

/**
 * This function multiplies each box, the width and the height by `factor`, and sets the unit. For
 * example, the factor `72 / 300` changes the pixels of an image at 300 dots per inch to PDF points.
 */
export function scaleText(text: OcrText, factor: number, unit: OcrUnit): OcrText {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError(`The scale factor must be a positive number, not ${factor}`);
  return {
    ...text,
    unit,
    width: round3(text.width * factor),
    height: round3(text.height * factor),
    lines: text.lines.map((line) => ({
      ...line,
      box: scaleBox(line.box, factor),
      words: line.words.map((word) => ({ ...word, box: scaleBox(word.box, factor) })),
    })),
  };
}
