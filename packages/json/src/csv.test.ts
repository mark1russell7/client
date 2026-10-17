/**
 * The CSV reader and writer (RFC 4180). The data is made up. A property test with fast-check: the
 * parse of the text of rows gives the rows again.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseCsv, stringifyCsv } from "./csv.js";
import { hasOwn } from "./value.js";

describe("parseCsv", () => {
  it("reads rows of fields", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
    expect(parseCsv("")).toEqual([]);
  });

  it("reads CRLF, LF and CR, and a line break at the end does not start a row", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseCsv("a\rb\nc\r\n")).toEqual([["a"], ["b"], ["c"]]);
  });

  it("reads quoted fields with commas, line breaks and doubled quotes", () => {
    const text = 'name,note\r\n"Smith, Jo","said ""hi""\r\nthen left"\r\n"",x\r\n';
    expect(parseCsv(text)).toEqual([
      ["name", "note"],
      ["Smith, Jo", 'said "hi"\r\nthen left'],
      ["", "x"],
    ]);
  });

  it("reads the doubled quote that a line splitter with a quote toggle reads wrongly", () => {
    // A toggle on each quote gives `Coffee 12oz` here: it loses the quote of the field
    expect(parseCsv('10/02/2026,"Coffee ""12oz""",-4.50')).toEqual([["10/02/2026", 'Coffee "12oz"', "-4.50"]]);
    expect(parseCsv('"""",""""""')).toEqual([['"', '""']]);
  });

  it("keeps empty fields, also at the end of a row", () => {
    expect(parseCsv(",a,,\n")).toEqual([["", "a", "", ""]]);
    expect(parseCsv("a,")).toEqual([["a", ""]]);
  });

  it("keeps a quote in a field without quotes", () => {
    expect(parseCsv('5" pipe,a"b')).toEqual([['5" pipe', 'a"b']]);
  });

  it("removes a byte order mark at the start", () => {
    expect(parseCsv("﻿date,amount\n2026-10-01,5\n", { header: true })).toEqual([{ date: "2026-10-01", amount: "5" }]);
    expect(parseCsv("a,﻿")).toEqual([["a", "﻿"]]);
  });

  it("skips empty lines, unless skipEmptyLines is false", () => {
    expect(parseCsv("a\n\nb\n\n")).toEqual([["a"], ["b"]]);
    expect(parseCsv("a\n\nb\n", { skipEmptyLines: false })).toEqual([["a"], [""], ["b"]]);
    // A quoted empty field is a row, and a row of delimiters is a row
    expect(parseCsv('""\n,\n')).toEqual([[""], ["", ""]]);
  });

  it("uses another delimiter", () => {
    expect(parseCsv('a;"b;c";d\n', { delimiter: ";" })).toEqual([["a", "b;c", "d"]]);
    expect(parseCsv("a\t b\t\n", { delimiter: "\t" })).toEqual([["a", " b", ""]]);
    expect(parseCsv("a\t b\t\n", { delimiter: "\t", trim: true })).toEqual([["a", "b", ""]]);
  });

  it("removes the white space around each field with trim, also around quotes", () => {
    expect(parseCsv(' a , "b, c" ,  " d "  \n   \n', { trim: true })).toEqual([["a", "b, c", "d"]]);
    expect(parseCsv(' a , b \n', {})).toEqual([[" a ", " b "]]);
  });

  it("gives objects with header", () => {
    const text = "Date,Description,Amount\n10/01/2026,Corner store,-12.00\n10/02/2026,Refund\n";
    expect(parseCsv(text, { header: true })).toEqual([
      { Date: "10/01/2026", Description: "Corner store", Amount: "-12.00" },
      { Date: "10/02/2026", Description: "Refund", Amount: "" },
    ]);
    expect(parseCsv("a,b\n", { header: true })).toEqual([]);
    expect(parseCsv("", { header: true })).toEqual([]);
  });

  it("keeps a column __proto__ as data", () => {
    const [row] = parseCsv("__proto__,constructor\nx,y\n", { header: true });
    expect(row !== undefined && hasOwn(row, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(row?.["__proto__"]).toBe("x");
    expect(row?.["constructor"]).toBe("y");
  });

  it.each([
    ['a,"b\nc', "the quote at line 1 has no closing quote"],
    ['a\n"b"x,c', 'line 2 has the character "x" after the closing quote of a field'],
  ])("refuses bad text with INVALID_CSV: %j", (text, message) => {
    expect(() => parseCsv(text)).toThrow(expect.objectContaining({ code: "INVALID_CSV", message: expect.stringContaining(message) as unknown }));
  });

  it("refuses a header with a name two times, and a row with more fields than the header", () => {
    expect(() => parseCsv("a,a\n1,2\n", { header: true })).toThrow(/the column "a" two times/);
    expect(() => parseCsv('a,b\n"1\n2",3\n4,5,6\n', { header: true })).toThrow(/the row at line 4 has 3 fields, and the header has 2/);
  });

  it("refuses a delimiter that is not one character, a quote or a line break", () => {
    for (const delimiter of ["", ";;", '"', "\n", "\r"]) {
      expect(() => parseCsv("a", { delimiter })).toThrow(expect.objectContaining({ code: "INVALID_CSV" }));
    }
  });
});

describe("stringifyCsv", () => {
  it("writes arrays, with quotes only where a field needs them, and CRLF after each row", () => {
    expect(stringifyCsv([["a", "b, c", 'say "hi"', "two\nlines"], [1, true, null, undefined]])).toBe('a,"b, c","say ""hi""","two\nlines"\r\n1,true,,\r\n');
    expect(stringifyCsv([])).toBe("");
  });

  it("writes objects with a header of each key in the order of the rows", () => {
    expect(stringifyCsv([{ date: "2026-10-01", amount: -12.5 }, { amount: 3, note: "x" }], { lineBreak: "\n" })).toBe("date,amount,note\n2026-10-01,-12.5,\n,3,x\n");
  });

  it("selects and orders the keys with columns, and writes no header with header: false", () => {
    const rows = [{ a: 1, b: 2, c: 3 }];
    expect(stringifyCsv(rows, { columns: ["c", "a"] })).toBe("c,a\r\n3,1\r\n");
    expect(stringifyCsv(rows, { columns: ["c", "a"], header: false })).toBe("3,1\r\n");
    expect(stringifyCsv([[1, 2]], { columns: ["x", "y"], delimiter: ";" })).toBe("x;y\r\n1;2\r\n");
  });

  it("puts quotes on a row of one empty field, so that the parse keeps it", () => {
    const text = stringifyCsv([["a"], [""], [null]]);
    expect(text).toBe('a\r\n""\r\n""\r\n');
    expect(parseCsv(text)).toEqual([["a"], [""], [""]]);
  });

  it("refuses rows that mix arrays and objects, and fields that are not values of a cell", () => {
    expect(() => stringifyCsv([["a"], { a: 1 }] as never)).toThrow(/all arrays or all objects/);
    expect(() => stringifyCsv([[{ a: 1 }]] as never)).toThrow(/field 1 of row 1 is not a string/);
    expect(() => stringifyCsv([[Number.NaN]])).toThrow(expect.objectContaining({ code: "INVALID_CSV" }));
    expect(() => stringifyCsv([{ a: [1] }] as never)).toThrow(/the field "a" of row 1/);
  });

  it("gives the rows again through parseCsv", () => {
    const field = fc.string({ unit: fc.constantFrom("a", " ", ",", ";", '"', "\r", "\n", "\r\n", "﻿", "é", "\t") });
    fc.assert(
      fc.property(fc.array(fc.array(field, { minLength: 1, maxLength: 4 }), { maxLength: 5 }), fc.constantFrom(",", ";", "\t"), fc.constantFrom("\r\n" as const, "\n" as const), (rows, delimiter, lineBreak) => {
        // A byte order mark at the start of the text is not data: the first field does not start with one
        const safe = rows.map((row, index) => (index === 0 ? row.map((cell, column) => (column === 0 && cell.startsWith("﻿") ? `a${cell}` : cell)) : row));
        expect(parseCsv(stringifyCsv(safe, { delimiter, lineBreak }), { delimiter })).toEqual(safe);
      }),
      { numRuns: 500 },
    );
  });

  it("gives the objects again through parseCsv with header", () => {
    const name = fc.string({ unit: fc.constantFrom("a", "b", ",", '"', "\n"), minLength: 1, maxLength: 3 });
    fc.assert(
      fc.property(fc.uniqueArray(name, { minLength: 1, maxLength: 4 }), fc.array(fc.array(fc.string(), { minLength: 4, maxLength: 4 }), { maxLength: 4 }), (columns, values) => {
        const rows = values.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ""])));
        expect(parseCsv(stringifyCsv(rows, { columns }), { header: true })).toEqual(rows);
      }),
      { numRuns: 300 },
    );
  });
});
