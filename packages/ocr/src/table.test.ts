/**
 * The table reader, on made-up words. No program starts.
 */

import { describe, expect, it } from "vitest";
import { makeLine, makeText, type OcrWord } from "./text.js";
import { tableOfText } from "./table.js";

/** This helper makes a word of height 10 at the left edge x and the top y. The width is 6 for each character. */
const word = (text: string, x: number, y: number, confidence = 0.9): OcrWord => ({ text, confidence, box: { x, y, w: 6 * text.length, h: 10 } });

/** This helper makes one row of a table: each cell starts at its x position, with one space of 3 between its words. */
function row(y: number, cells: readonly (readonly [number, string])[]): OcrWord[] {
  return cells.flatMap(([x, text]) => {
    let left = x;
    return text.split(" ").map((part) => {
      const made = word(part, left, y);
      left += made.box.w + 3;
      return made;
    });
  });
}

/** A small table: an id, a street, a name and a price that is right-aligned at x = 400. */
const right = (text: string): readonly [number, string] => [400 - 6 * text.length, text];
const ROWS = [
  row(10, [[10, "ID"], [60, "STREET"], [200, "NAME"], right("PRICE")]),
  row(30, [[10, "1-2"], [60, "12 Oak St"], [200, "Some One"], right("1,050.00")]),
  row(50, [[10, "1-3"], [60, "4 Elm Rd"], [200, "No Sale"], right("50.00")]),
  row(70, [[10, "1-4"], [60, "1200 Long Name Ave"], [200, "Two"], right("15,000.00")]),
];

describe("tableOfText", () => {
  it("finds the rows and the columns of a table", () => {
    const table = tableOfText(ROWS.flat());
    expect(table.rows).toHaveLength(4);
    expect(table.columns).toHaveLength(4);
    expect(table.rows.map((each) => each.cells.map((cell) => cell?.text ?? null))).toEqual([
      ["ID", "STREET", "NAME", "PRICE"],
      ["1-2", "12 Oak St", "Some One", "1,050.00"],
      ["1-3", "4 Elm Rd", "No Sale", "50.00"],
      ["1-4", "1200 Long Name Ave", "Two", "15,000.00"],
    ]);
  });

  it("gives the words, the mean confidence and the union box of each cell", () => {
    const words = [word("12", 60, 30, 0.8), word("Oak", 75, 30, 0.6), word("9", 200, 30)];
    const cell = tableOfText(words, { minShare: 0 }).rows[0]?.cells[0];
    expect(cell?.text).toBe("12 Oak");
    expect(cell?.confidence).toBeCloseTo(0.7);
    expect(cell?.box).toEqual({ x: 60, y: 30, w: 33, h: 10 });
    expect(cell?.words).toHaveLength(2);
  });

  it("puts the words of the rows in the order of their position, not of their input", () => {
    const table = tableOfText([...ROWS.flat()].reverse());
    expect(table.rows[1]?.cells[1]?.text).toBe("12 Oak St");
  });

  it("keeps a word in a row when its box is a little higher or lower", () => {
    const words = [word("1-2", 10, 30), word("12", 60, 33), word("Oak", 75, 28)];
    const table = tableOfText(words, { minShare: 0 });
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.cells.map((cell) => cell?.text)).toEqual(["1-2", "12 Oak"]);
  });

  it("gives null for a column with no word in a row", () => {
    const words = [...ROWS.flat(), ...row(90, [[10, "1-5"], right("75.00")])];
    const last = tableOfText(words).rows[4];
    expect(last?.cells.map((cell) => cell?.text ?? null)).toEqual(["1-5", null, null, "75.00"]);
  });

  it("puts a long cell that touches the next column into two cells at the edge of that column", () => {
    // The street ends 3 after the start of the name column, with no wide gap.
    // Its start at 140 is inside the street column, so it does not move the edge of the name column.
    const touch = [word("1-6", 10, 90), word("Longest", 140, 90), word("Way", 185, 90), word("Name", 200, 90)];
    const table = tableOfText([...ROWS.flat(), ...touch]);
    expect(table.rows[4]?.cells.slice(0, 3).map((cell) => cell?.text)).toEqual(["1-6", "Longest Way", "Name"]);
  });

  it("keeps a right-aligned first column of numbers as one column", () => {
    const numbers = ["9", "99999", "9", "99999"].map((text, index) => row(10 + 20 * index, [[30 - 6 * text.length, text], [60, "x"]]));
    const table = tableOfText(numbers.flat());
    expect(table.columns).toEqual([0, 60]);
    expect(table.rows.map((each) => each.cells.map((cell) => cell?.text ?? null))).toEqual([
      ["9", "x"],
      ["99999", "x"],
      ["9", "x"],
      ["99999", "x"],
    ]);
  });

  it("does not make a column from the start of one cell in a single row", () => {
    const words = [...ROWS.flat(), ...row(90, [[10, "1-6"], [60, "Main St"], [130, "note"]])];
    const table = tableOfText(words);
    expect(table.columns).toHaveLength(4);
    expect(table.rows[4]?.cells[1]?.text).toBe("Main St note");
  });

  it("reads the words of an OCR text, and skips the empty words", () => {
    const words = [...ROWS.flat(), word(" ", 300, 30)];
    const text = makeText([makeLine(words)], "px", 500, 100);
    expect(tableOfText(text)).toEqual(tableOfText(ROWS.flat()));
  });

  it("gives an empty table for no words", () => {
    expect(tableOfText([])).toEqual({ columns: [], rows: [] });
    expect(tableOfText([word("", 0, 0)])).toEqual({ columns: [], rows: [] });
  });

  it("gives one column when no column has enough rows", () => {
    const words = [word("a", 10, 10), word("b", 100, 10), word("c", 50, 30)];
    const table = tableOfText(words, { minShare: 1 });
    expect(table.columns).toEqual([10]);
    expect(table.rows.map((each) => each.cells[0]?.text)).toEqual(["a b", "c"]);
  });

  it("refuses an option that is not a finite number of 0 or more", () => {
    expect(() => tableOfText(ROWS.flat(), { rowTolerance: -1 })).toThrow(RangeError);
    expect(() => tableOfText(ROWS.flat(), { cellGap: Number.NaN })).toThrow(/cellGap/);
    expect(() => tableOfText(ROWS.flat(), { columnTolerance: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => tableOfText(ROWS.flat(), { minShare: -0.1 })).toThrow(RangeError);
  });
});
