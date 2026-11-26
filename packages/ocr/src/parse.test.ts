/**
 * The parsers of the engine output and of the text layer, on made-up fixtures. No program starts.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decodeXmlText,
  makeLine,
  makeText,
  meanConfidence,
  parsePdfinfoPages,
  parsePdftotextBbox,
  parseTesseractOsd,
  parseTesseractTsv,
  scaleText,
  tesseractConfidence,
  TESSERACT_TSV_COLUMNS,
  turnBox,
  turnText,
  unionBox,
  type OcrTurn,
} from "./parse.js";

const fixture = (name: string): string => readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), "utf8");

describe("parseTesseractTsv", () => {
  const text = parseTesseractTsv(fixture("tesseract.tsv"));

  it("gives the lines and the words with their text, confidence and box", () => {
    expect(text.unit).toBe("px");
    expect([text.width, text.height]).toEqual([640, 200]);
    expect(text.text).toBe("Hello world\nTotal 12.50");
    expect(text.lines).toHaveLength(2);
    const [first, second] = text.lines;
    expect(first!.box).toEqual({ x: 40, y: 30, w: 300, h: 40 });
    expect(first!.words).toEqual([
      { text: "Hello", confidence: 0.965, box: { x: 40, y: 30, w: 130, h: 40 } },
      { text: "world", confidence: 0.9125, box: { x: 190, y: 32, w: 150, h: 38 } },
    ]);
    expect(first!.confidence).toBeCloseTo((0.965 + 0.9125) / 2, 10);
    expect(second!.words.map((word) => [word.text, word.confidence])).toEqual([
      ["Total", 0.88],
      ["12.50", 0.72],
    ]);
  });

  it("leaves out the words with no text and the lines with no word", () => {
    expect(text.lines.flatMap((line) => line.words)).toHaveLength(4);
    expect(text.confidence).toBeCloseTo((0.965 + 0.9125 + 0.88 + 0.72) / 4, 10);
  });

  it("names the 12 columns of the TSV", () => {
    expect(fixture("tesseract.tsv").split("\n")[0]!.split("\t")).toEqual(TESSERACT_TSV_COLUMNS);
  });

  it("takes the union of the words for a line with no row of level 4, and the union of all rows with no page row", () => {
    const tsv = ["5\t1\t1\t1\t1\t1\t10\t20\t30\t10\t50\tab", "5\t1\t1\t1\t1\t2\t50\t18\t20\t14\t100\tcd", "not a row", "4\t1"].join("\r\n");
    const result = parseTesseractTsv(tsv);
    expect(result.lines[0]!.box).toEqual({ x: 10, y: 18, w: 60, h: 14 });
    expect([result.width, result.height]).toEqual([70, 32]);
    expect(result.text).toBe("ab cd");
  });

  it("takes the size of the first page, and the lines of each page", () => {
    const rows = [
      [1, 1, 0, 0, 0, 0, 0, 0, 100, 50, -1, ""],
      [5, 1, 1, 1, 1, 1, 1, 1, 5, 5, 90, "one"],
      [1, 2, 0, 0, 0, 0, 0, 0, 300, 300, -1, ""],
      [5, 2, 1, 1, 1, 1, 1, 1, 5, 5, 90, "two"],
    ];
    const result = parseTesseractTsv(rows.map((row) => row.join("\t")).join("\n"));
    expect([result.width, result.height]).toEqual([100, 50]);
    expect(result.text).toBe("one\ntwo");
  });

  it("gives an empty text for an empty output", () => {
    expect(parseTesseractTsv("")).toEqual({ unit: "px", width: 0, height: 0, text: "", confidence: 0, lines: [] });
  });

  it("changes a confidence of tesseract to a value from 0 to 1", () => {
    expect(tesseractConfidence(-1)).toBe(0);
    expect(tesseractConfidence(Number.NaN)).toBe(0);
    expect(tesseractConfidence(50)).toBe(0.5);
    expect(tesseractConfidence(120)).toBe(1);
  });
});

describe("parsePdftotextBbox", () => {
  it("gives the lines and the words of the text layer, in points, with the confidence 1", () => {
    const text = parsePdftotextBbox(fixture("bbox-layout.html"));
    expect(text.unit).toBe("pt");
    expect([text.width, text.height]).toEqual([612, 792]);
    expect(text.text).toBe('Fish & chips\n<café> "open"');
    expect(text.confidence).toBe(1);
    expect(text.lines[0]!.box).toEqual({ x: 72, y: 71, w: 118.5, h: 12 });
    expect(text.lines[0]!.words[1]).toEqual({ text: "&", confidence: 1, box: { x: 113, y: 71, w: 22, h: 12 } });
  });

  it("gives the size of a page with no text layer, and no line", () => {
    const text = parsePdftotextBbox(fixture("bbox-empty.html"));
    expect(text).toEqual({ unit: "pt", width: 595.276, height: 841.89, text: "", confidence: 0, lines: [] });
  });

  it("leaves out a word with no box or no text, and takes the union of the words for a line with no box", () => {
    const xhtml = [
      '<page width="x">',
      "<line>",
      '<word xMin="1" yMin="2" xMax="5" yMax="6">ab</word>',
      '<word xMin="1" yMin="2">cd</word>',
      '<word xMin="7" yMin="2" xMax="9" yMax="6">  </word>',
      "</line>",
      '<line xMin="0" yMin="0" xMax="1" yMax="1"><word>ef</word></line>',
    ].join("\n");
    const text = parsePdftotextBbox(xhtml);
    expect(text.lines).toEqual([{ text: "ab", confidence: 1, box: { x: 1, y: 2, w: 4, h: 4 }, words: [{ text: "ab", confidence: 1, box: { x: 1, y: 2, w: 4, h: 4 } }] }]);
    expect([text.width, text.height]).toEqual([0, 0]);
  });

  it("reads only the first page", () => {
    const two = '<page width="10" height="10"><line><word xMin="0" yMin="0" xMax="1" yMax="1">one</word></line></page><page width="20" height="20"><line><word xMin="0" yMin="0" xMax="1" yMax="1">two</word></line></page>';
    expect(parsePdftotextBbox(two).text).toBe("one");
  });

  it("reads a tag with a long run of name characters and no = in linear time", () => {
    const tag = `<page${" :".repeat(1)}${":".repeat(200_000)} width="10" height="20">`;
    const started = performance.now();
    const text = parsePdftotextBbox(`${tag}</page>`);
    expect([text.width, text.height]).toEqual([10, 20]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("throws for an output with no page element", () => {
    expect(() => parsePdftotextBbox("<html></html>")).toThrow(/no page element/);
  });

  it("decodes the entities of a text", () => {
    expect(decodeXmlText("&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos; &#65;&#x42; &unknown; &#x110000;")).toBe("<a> & \"b\" 'c' AB &unknown; &#x110000;");
  });
});

describe("the records of a text", () => {
  it("gives the union of boxes, and the box 0, 0, 0, 0 for no box", () => {
    expect(unionBox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(unionBox([{ x: 5, y: 5, w: 1, h: 1 }, { x: 1, y: 2, w: 2, h: 2 }])).toEqual({ x: 1, y: 2, w: 5, h: 4 });
  });

  it("gives the mean confidence, and 0 for no word", () => {
    expect(meanConfidence([])).toBe(0);
    const word = { text: "a", confidence: 0.5, box: { x: 0, y: 0, w: 1, h: 1 } };
    expect(meanConfidence([word, { ...word, confidence: 1 }])).toBe(0.75);
  });

  it("scales the boxes and the size, and sets the unit", () => {
    const word = { text: "a", confidence: 0.5, box: { x: 300, y: 600, w: 100, h: 1 } };
    const text = makeText([makeLine([word])], "px", 2550, 3300);
    const points = scaleText(text, 72 / 300, "pt");
    expect(points.unit).toBe("pt");
    expect([points.width, points.height]).toEqual([612, 792]);
    expect(points.lines[0]!.box).toEqual({ x: 72, y: 144, w: 24, h: 0.24 });
    expect(points.lines[0]!.words[0]!.box).toEqual({ x: 72, y: 144, w: 24, h: 0.24 });
    expect(points.text).toBe("a");
  });

  it("refuses a scale factor that is not a positive number", () => {
    const text = makeText([], "px", 1, 1);
    expect(() => scaleText(text, 0, "pt")).toThrow(RangeError);
    expect(() => scaleText(text, Number.POSITIVE_INFINITY, "pt")).toThrow(RangeError);
  });
});

describe("the turn of a page", () => {
  // A page of 300 by 100 pixels on its side, with one word near its top-left corner
  const word = { text: "PARCEL", confidence: 0.9, box: { x: 10, y: 20, w: 5, h: 40 } };
  const page = makeText([makeLine([word])], "px", 300, 100);

  it("turns a box in the clock direction, in the frame of the turned page", () => {
    expect(turnBox(word.box, 0, 300, 100)).toEqual(word.box);
    // The left side of the scan becomes the top of the upright page
    expect(turnBox(word.box, 90, 300, 100)).toEqual({ x: 40, y: 10, w: 40, h: 5 });
    expect(turnBox(word.box, 180, 300, 100)).toEqual({ x: 285, y: 40, w: 5, h: 40 });
    expect(turnBox(word.box, 270, 300, 100)).toEqual({ x: 20, y: 285, w: 40, h: 5 });
  });

  it("keeps each box in the turned page", () => {
    for (const turn of [90, 180, 270] as const) {
      const turned = turnText(page, turn);
      const box = turned.lines[0]!.words[0]!.box;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(turned.width);
      expect(box.y + box.h).toBeLessThanOrEqual(turned.height);
    }
  });

  it("changes the width and the height for a turn on the side, and keeps the text", () => {
    const turned = turnText(page, 90);
    expect([turned.width, turned.height]).toEqual([100, 300]);
    expect(turned).toMatchObject({ unit: "px", text: "PARCEL", confidence: 0.9 });
    expect(turned.lines[0]!.box).toEqual({ x: 40, y: 10, w: 40, h: 5 });
    expect([turnText(page, 180).width, turnText(page, 180).height]).toEqual([300, 100]);
  });

  it("gives the same text for the turn 0, and the start text after a full turn", () => {
    expect(turnText(page, 0)).toBe(page);
    expect(turnText(turnText(page, 90), 270)).toEqual(page);
    expect(turnText(turnText(page, 180), 180)).toEqual(page);
    expect(turnText(turnText(turnText(turnText(page, 90), 90), 90), 90)).toEqual(page);
  });

  it("refuses a turn that is not a multiple of 90 degrees", () => {
    expect(() => turnText(page, 45 as OcrTurn)).toThrow(RangeError);
  });
});

describe("parseTesseractOsd", () => {
  const lines = (...values: string[]): string => values.map((value) => `${value}\n`).join("");

  it("reads the turn and the confidence of the orientation output", () => {
    const output = lines("Page number: 0", "Orientation in degrees: 270", "Rotate: 90", "Orientation confidence: 2.00", "Script: Latin", "Script confidence: 0.39");
    expect(parseTesseractOsd(output)).toEqual({ turn: 90, confidence: 2 });
    expect(parseTesseractOsd(output.replace(/\n/g, "\r\n"))).toEqual({ turn: 90, confidence: 2 });
  });

  it("gives the turn 0 and the confidence 0 for an output with no valid turn", () => {
    expect(parseTesseractOsd("")).toEqual({ turn: 0, confidence: 0 });
    expect(parseTesseractOsd(lines("Too few characters. Skipping this page"))).toEqual({ turn: 0, confidence: 0 });
    expect(parseTesseractOsd(lines("Rotate: 45", "Orientation confidence: 9"))).toEqual({ turn: 0, confidence: 0 });
  });

  it("gives the confidence 0 when the output has a turn but no confidence", () => {
    expect(parseTesseractOsd(lines("Rotate: 180"))).toEqual({ turn: 180, confidence: 0 });
    expect(parseTesseractOsd(lines("Rotate: 180", "Orientation confidence: 1.2.3"))).toEqual({ turn: 180, confidence: 0 });
  });
});

describe("parsePdfinfoPages", () => {
  it("reads the number of pages of the output of pdfinfo", () => {
    const output = fixture("pdfinfo.txt");
    expect(parsePdfinfoPages(output)).toBe(12);
    expect(parsePdfinfoPages(output.replace(/\n/g, "\r\n"))).toBe(12);
    expect(parsePdfinfoPages("Pages: 0\n")).toBe(0);
    expect(parsePdfinfoPages("Pages:\t3")).toBe(3);
  });

  it("does not read the word Pages in the value of another field", () => {
    expect(() => parsePdfinfoPages("Title:           Pages: 7 of a report\nEncrypted:       no\n")).toThrow(/no Pages line/);
  });

  it("throws for an output with no Pages line or with no whole number", () => {
    expect(() => parsePdfinfoPages("")).toThrow("The output of pdfinfo has no Pages line with a whole number");
    expect(() => parsePdfinfoPages("Pages:           many\n")).toThrow(/no Pages line/);
    expect(() => parsePdfinfoPages("Pages:           2.5\n")).toThrow(/no Pages line/);
    expect(() => parsePdfinfoPages("Pages:           99999999999999999999\n")).toThrow(/no Pages line/);
  });
});
