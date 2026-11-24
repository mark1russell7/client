/**
 * The parse of the TSV output of tesseract (`tesseract <image> stdout tsv`). This file starts no
 * process and reads no file.
 *
 * Each row of the TSV has 12 columns: `level`, `page_num`, `block_num`, `par_num`, `line_num`,
 * `word_num`, `left`, `top`, `width`, `height`, `conf` and `text`. The level is 1 for the page, 2 for
 * a block, 3 for a paragraph, 4 for a line and 5 for a word. Only a word has a confidence: the other
 * rows have the confidence -1.
 */

import { makeLine, makeText, unionBox, type OcrText, type OcrWord, type Rect } from "./text.js";

/** The columns of the TSV of tesseract, in order. */
export const TESSERACT_TSV_COLUMNS: readonly string[] = [
  "level",
  "page_num",
  "block_num",
  "par_num",
  "line_num",
  "word_num",
  "left",
  "top",
  "width",
  "height",
  "conf",
  "text",
];

const PAGE_LEVEL = 1;
const LINE_LEVEL = 4;
const WORD_LEVEL = 5;

/** One row of the TSV, with the numbers parsed. */
interface Row {
  readonly level: number;
  /** The key of the line of the row: the page, the block, the paragraph and the line. */
  readonly line: string;
  readonly box: Rect;
  readonly conf: number;
  readonly text: string;
}

/** This function parses one row, or gives undefined for a row that is not a valid row of the TSV. */
function parseRow(fields: readonly string[]): Row | undefined {
  if (fields.length < 11) return undefined;
  const numbers = fields.slice(0, 11).map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) return undefined;
  const [level, page, block, paragraph, line, , left, top, width, height, conf] = numbers as [number, number, number, number, number, number, number, number, number, number, number];
  return {
    level,
    line: `${page}/${block}/${paragraph}/${line}`,
    box: { x: left, y: top, w: width, h: height },
    conf,
    // The text is the last column. A text with a tab in it is not possible, but the parse keeps it.
    text: fields.slice(11).join("\t").trim(),
  };
}

/** This function changes a confidence of tesseract (0 to 100, or -1 for no value) to a value from 0 to 1. */
export function tesseractConfidence(conf: number): number {
  if (!(conf > 0)) return 0;
  return Math.min(conf, 100) / 100;
}

/**
 * This function parses the TSV output of tesseract. It gives the lines of words in the order of
 * the output, with the boxes in the pixels of the image.
 *
 * - The parse ignores the header row, an empty row and a row that is not valid.
 * - A word with no text is not in the result. A line with no word is not in the result.
 * - The box of a line is the box of its row of level 4, else the union of the boxes of its words.
 * - The size is the size of the first row of level 1, else the union of all boxes.
 * - With more than one page (a TIFF file with pages), the lines of all pages are in one result.
 */
export function parseTesseractTsv(tsv: string): OcrText {
  const rows: Row[] = [];
  for (const raw of tsv.split(/\r?\n/)) {
    if (raw.trim().length === 0) continue;
    const row = parseRow(raw.split("\t"));
    if (row !== undefined) rows.push(row);
  }

  const lineBoxes = new Map<string, Rect>();
  const lineWords = new Map<string, OcrWord[]>();
  let page: Rect | undefined;
  for (const row of rows) {
    if (row.level === PAGE_LEVEL) {
      page ??= row.box;
    } else if (row.level === LINE_LEVEL) {
      lineBoxes.set(row.line, row.box);
    } else if (row.level === WORD_LEVEL && row.text.length > 0) {
      const words = lineWords.get(row.line) ?? [];
      words.push({ text: row.text, confidence: tesseractConfidence(row.conf), box: row.box });
      lineWords.set(row.line, words);
    }
  }

  const lines = [...lineWords].map(([key, words]) => makeLine(words, lineBoxes.get(key)));
  const size = page ?? unionBox(rows.map((row) => row.box));
  return makeText(lines, "px", size.x + size.w, size.y + size.h);
}
