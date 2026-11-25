/**
 * The rows and the columns of a table, from the boxes of its words. This file starts no process and
 * reads no file.
 *
 * OCR gives words and lines, not cells. A scan of a table needs its cells, for example to read
 * one column of each row. The method uses only the boxes:
 *
 * 1. Two words are in one row when the vertical centers of their boxes are near.
 * 2. In a row, a wide gap between two words starts a new cell.
 * 3. A column starts at an x position where many rows start a cell.
 * 4. Each word goes to the column that holds the center of its box.
 *
 * The lengths of the options are shares of the median height of the words, so one set of options
 * works for pixels and for points.
 */

import { unionBox, type OcrText, type OcrWord, type Rect } from "./text.js";

/** The options of `tableOfText`. Each length is a share of the median height of the words. */
export interface OcrTableOptions {
  /** Two words are in one row when their vertical centers differ by less than this share. The default is 0.7. */
  readonly rowTolerance?: number | undefined;
  /** In a row, a gap of more than this share between two words starts a new cell. The default is 0.75. */
  readonly cellGap?: number | undefined;
  /** Two starts of cells are in one column when they differ by no more than this share. The default is 1. */
  readonly columnTolerance?: number | undefined;
  /** A column needs starts of cells in this share of the rows, from 0 to 1. The default is 0.25. */
  readonly minShare?: number | undefined;
}

/** One cell: its words, their text with one space between words, the mean confidence and the union of the boxes. */
export interface OcrTableCell {
  readonly text: string;
  readonly confidence: number;
  readonly box: Rect;
  readonly words: readonly OcrWord[];
}

/** One row: the union of the boxes of its words, and one cell for each column. A column with no word in the row has `null`. */
export interface OcrTableRow {
  readonly box: Rect;
  readonly cells: readonly (OcrTableCell | null)[];
}

/** A table: the left edge of each column, from left to right, and the rows from top to bottom. */
export interface OcrTable {
  readonly columns: readonly number[];
  readonly rows: readonly OcrTableRow[];
}

/** This function gives the value of an option, or its default. It refuses a value that is not finite or less than 0. */
function option(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`tableOfText: the option ${name} is ${value}. It is a finite number of 0 or more.`);
  return value;
}

const center = (box: Rect): number => box.x + box.w / 2;
const middle = (box: Rect): number => box.y + box.h / 2;

/** This function groups the words into rows, from top to bottom. Each row has its words from left to right. */
function groupRows(words: readonly OcrWord[], tolerance: number): OcrWord[][] {
  const sorted = [...words].sort((a, b) => middle(a.box) - middle(b.box) || a.box.x - b.box.x);
  const rows: { mean: number; words: OcrWord[] }[] = [];
  for (const word of sorted) {
    const row = rows[rows.length - 1];
    const value = middle(word.box);
    if (row !== undefined && Math.abs(value - row.mean) < tolerance) {
      row.words.push(word);
      row.mean += (value - row.mean) / row.words.length;
    } else rows.push({ mean: value, words: [word] });
  }
  return rows.map((row) => row.words.sort((a, b) => a.box.x - b.box.x));
}

/** One start of a cell: the left edge and the right edge of the cell, and the index of its row. */
interface CellStart {
  readonly x: number;
  readonly end: number;
  readonly row: number;
}

/** This function gives the median of a list of numbers that is not empty. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[half] as number) : ((sorted[half - 1] as number) + (sorted[half] as number)) / 2;
}

/**
 * This function gives the left edge of each column.
 *
 * - Each start of a cell goes to a cluster of starts that are near.
 * - A column of numbers is often right-aligned. Then its starts are far apart, and they make
 *   two clusters or more. Two clusters next to each other can be one column.
 *   This is true when the median right edges of their cells are near, and no row has a cell in each cluster.
 * - A cluster with starts in less than `minShare` of the rows is not a column.
 */
function findColumns(rows: readonly OcrWord[][], gap: number, tolerance: number, minShare: number): number[] {
  const starts: CellStart[] = [];
  rows.forEach((words, row) => {
    let first = 0;
    words.forEach((word, index) => {
      const next = words[index + 1];
      if (next === undefined || next.box.x - (word.box.x + word.box.w) > gap) {
        const start = words[first] as OcrWord;
        starts.push({ x: start.box.x, end: word.box.x + word.box.w, row });
        first = index + 1;
      }
    });
  });
  starts.sort((a, b) => a.x - b.x);
  const clusters: CellStart[][] = [];
  for (const start of starts) {
    const cluster = clusters[clusters.length - 1];
    const last = cluster?.[cluster.length - 1];
    if (cluster !== undefined && last !== undefined && start.x - last.x <= tolerance) cluster.push(start);
    else clusters.push([start]);
  }
  const merged: CellStart[][] = [];
  for (const cluster of clusters) {
    const before = merged[merged.length - 1];
    const rowsBefore = new Set(before?.map((start) => start.row));
    const aligned =
      before !== undefined &&
      Math.abs(median(before.map((start) => start.end)) - median(cluster.map((start) => start.end))) <= tolerance &&
      cluster.every((start) => !rowsBefore.has(start.row));
    if (aligned) before.push(...cluster);
    else merged.push([...cluster]);
  }
  return merged
    .filter((cluster) => new Set(cluster.map((start) => start.row)).size >= minShare * rows.length)
    .map((cluster) => Math.min(...cluster.map((start) => start.x)));
}

/** This function gives the index of the column that holds the x position: the last column with its left edge at or before it. */
function columnOf(columns: readonly number[], x: number): number {
  let index = 0;
  columns.forEach((edge, column) => {
    if (edge <= x) index = column;
  });
  return index;
}

/** This function makes a cell from its words, in their order from left to right. */
function makeCell(words: readonly OcrWord[]): OcrTableCell {
  return {
    text: words.map((word) => word.text).join(" "),
    confidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length,
    box: unionBox(words.map((word) => word.box)),
    words,
  };
}

/**
 * This function gives the rows and the columns of a table from the boxes of its words. Give the
 * words of one table only: a title or a note above the table becomes a row too.
 *
 * - A row has one cell for each column. A cell is `null` when the row has no word in its column.
 * - A column that holds few starts of cells (less than `minShare` of the rows) is not a column. Its
 *   words go to the column at their left.
 * - A word with an empty text is not a word of the table.
 *
 * @param source - A text from the OCR, or its words
 * @param options - The tolerances, as shares of the median height of the words
 * @throws RangeError when an option is not a finite number of 0 or more
 */
export function tableOfText(source: OcrText | readonly OcrWord[], options: OcrTableOptions = {}): OcrTable {
  const all = "lines" in source ? source.lines.flatMap((line) => line.words) : source;
  const words = all.filter((word) => word.text.trim().length > 0);
  const rowTolerance = option("rowTolerance", options.rowTolerance, 0.7);
  const cellGap = option("cellGap", options.cellGap, 0.75);
  const columnTolerance = option("columnTolerance", options.columnTolerance, 1);
  const minShare = option("minShare", options.minShare, 0.25);
  if (words.length === 0) return { columns: [], rows: [] };
  const heights = words.map((word) => word.box.h).sort((a, b) => a - b);
  const height = heights[Math.floor(heights.length / 2)] as number;
  const rows = groupRows(words, rowTolerance * height);
  const found = findColumns(rows, cellGap * height, columnTolerance * height, minShare);
  // With no column that passes minShare, the table has one column, so that each word stays in a cell
  const columns = found.length > 0 ? found : [Math.min(...words.map((word) => word.box.x))];
  return {
    columns,
    rows: rows.map((row) => {
      const cells: OcrWord[][] = columns.map(() => []);
      for (const word of row) (cells[columnOf(columns, center(word.box))] as OcrWord[]).push(word);
      return { box: unionBox(row.map((word) => word.box)), cells: cells.map((cell) => (cell.length === 0 ? null : makeCell(cell))) };
    }),
  };
}
