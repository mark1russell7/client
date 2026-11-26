/**
 * createLineSplitter: the split of a stream of output into lines, the helper of streamCommand.
 */

import { describe, expect, it } from "vitest";
import { createLineSplitter } from "./index.js";

/** This function gives all the lines of the chunks, with the flush at the end. */
function linesOf(chunks: readonly (string | Uint8Array)[], maxLineLength?: number): string[] {
  const splitter = createLineSplitter({ maxLineLength });
  return [...chunks.flatMap((chunk) => splitter.push(chunk)), ...splitter.flush()];
}

describe("createLineSplitter", () => {
  it("gives each line at a line feed and at a carriage return and line feed, with no line end", () => {
    expect(linesOf(["a\nb\r\nc"])).toEqual(["a", "b", "c"]);
    expect(linesOf(["a\n\nb\n"])).toEqual(["a", "", "b"]);
  });

  it("keeps a part of a line until its end comes in a later chunk", () => {
    const splitter = createLineSplitter();
    expect(splitter.push("ab")).toEqual([]);
    expect(splitter.push("c\nd")).toEqual(["abc"]);
    expect(splitter.flush()).toEqual(["d"]);
    expect(splitter.flush()).toEqual([]);
  });

  it("joins a carriage return and line feed that two chunks cut", () => {
    expect(linesOf(["a\r", "\nb"])).toEqual(["a", "b"]);
    expect(linesOf(["a\r"])).toEqual(["a"]);
  });

  it("decodes a UTF-8 character whose bytes two chunks cut", () => {
    const bytes = new TextEncoder().encode("é€\n");
    expect(linesOf([bytes.subarray(0, 1), bytes.subarray(1, 3), bytes.subarray(3)])).toEqual(["é€"]);
  });

  it("gives a long line in parts before its end comes", () => {
    const splitter = createLineSplitter({ maxLineLength: 4 });
    expect(splitter.push("abcdefghij")).toEqual(["abcd", "efgh"]);
    expect(splitter.push("k\nlmnopq\n")).toEqual(["ijk", "lmno", "pq"]);
  });

  it("gives no empty line when a line fills its last part", () => {
    const splitter = createLineSplitter({ maxLineLength: 2 });
    expect(splitter.push("abcd")).toEqual(["ab"]);
    expect(splitter.push("\nef\n")).toEqual(["cd", "ef"]);
    expect(linesOf(["ab", "\n"], 2)).toEqual(["ab"]);
  });

  it("holds a last carriage return of a full part, so its line feed adds no empty line", () => {
    const splitter = createLineSplitter({ maxLineLength: 2 });
    expect(splitter.push("ab\r")).toEqual([]);
    expect(splitter.push("\nc")).toEqual(["ab"]);
  });

  it("gives the same lines for each cut of the stream into three chunks", () => {
    const text = "one\r\ntwo\n\nthree é€ four\r\nfive";
    const bytes = new TextEncoder().encode(text);
    const whole = linesOf([text], 5);
    for (let a = 0; a <= bytes.length; a++) {
      for (let b = a; b <= bytes.length; b++) {
        expect(linesOf([bytes.subarray(0, a), bytes.subarray(a, b), bytes.subarray(b)], 5)).toEqual(whole);
      }
    }
  });

  it("refuses an encoding that Buffer does not know", () => {
    expect(() => createLineSplitter({ encoding: "nope" as BufferEncoding })).toThrow(TypeError);
  });
});
