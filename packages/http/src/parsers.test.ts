/**
 * The stream parsers: the lines of NDJSON and the events of an event stream. The chunks break
 * lines, line ends and characters at each place.
 */

import { describe, expect, it } from "vitest";
import { HttpError } from "./errors.js";
import { ndjsonLines, sseEvents, type ServerSentEvent } from "./parsers.js";

async function* chunksOf(...chunks: Array<string | Uint8Array>): AsyncGenerator<Uint8Array | string> {
  for (const chunk of chunks) yield typeof chunk === "string" ? Buffer.from(chunk) : chunk;
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

/** Each split of a text into two chunks, at each byte. */
function* splits(text: string): Generator<[Uint8Array, Uint8Array]> {
  const bytes = Buffer.from(text);
  for (let at = 0; at <= bytes.length; at++) yield [bytes.subarray(0, at), bytes.subarray(at)];
}

describe("ndjsonLines", () => {
  it("gives each line that is not blank, with its number", async () => {
    const lines = await collect(ndjsonLines(chunksOf('{"a":1}\n\n  \n[2]\r\n"three"'), 100));
    expect(lines).toEqual([
      { line: 1, text: '{"a":1}' },
      { line: 4, text: "[2]" },
      { line: 5, text: '"three"' },
    ]);
  });

  it("skips the keep-alive lines of a server: blank lines in their own chunks, between the parts of a line too", async () => {
    // The keep-alive line of wire protocol v1 is a lone LF (WIRE-PROTOCOL.md). A CRLF is blank too.
    const lines = await collect(ndjsonLines(chunksOf("\n", '{"a":1}\n', "\n", "\n", '{"b"', ":2}\n", "\r\n", "\n"), 100));
    expect(lines).toEqual([
      { line: 2, text: '{"a":1}' },
      { line: 5, text: '{"b":2}' },
    ]);
  });

  it("gives the same lines for each split of the bytes", async () => {
    const text = '﻿{"name":"Zoë 🎉"}\r\n{"b":2}\n';
    for (const [first, second] of splits(text)) {
      const lines = await collect(ndjsonLines(chunksOf(first, second), 100));
      expect(lines.map((line) => JSON.parse(line.text))).toEqual([{ name: "Zoë 🎉" }, { b: 2 }]);
    }
  });

  it("refuses a line of more than maxLineBytes bytes", async () => {
    await expect(collect(ndjsonLines(chunksOf("12345\n"), 5))).resolves.toHaveLength(1);
    await expect(collect(ndjsonLines(chunksOf("12345\r\n"), 5))).resolves.toHaveLength(1);
    await expect(collect(ndjsonLines(chunksOf("123456\n"), 5))).rejects.toMatchObject({ code: "LINE_TOO_LARGE" });
    await expect(collect(ndjsonLines(chunksOf("1\n", "23", "4567"), 5))).rejects.toThrow(/line 2 has more than 5 bytes/);
    // A line without its end: the limit applies before the end arrives
    const endless = async function* (): AsyncGenerator<Uint8Array> {
      for (;;) yield Buffer.alloc(1000, 0x61);
    };
    await expect(collect(ndjsonLines(endless(), 5000))).rejects.toBeInstanceOf(HttpError);
  });
});

describe("sseEvents", () => {
  const events = (text: string, max = 1000): Promise<ServerSentEvent[]> => collect(sseEvents(chunksOf(text), max));

  it("parses the events of the HTML standard", async () => {
    const text = ": a comment\n\ndata: first\ndata: second\n\nevent: add\ndata: 73857293\nid: 7\n\ndata\ndata\n\ndata:  two spaces\n\ndata:x\nretry: 3000\n\n";
    expect(await events(text)).toEqual([
      { event: "message", data: "first\nsecond" },
      { event: "add", data: "73857293", id: "7" },
      { event: "message", data: "\n", id: "7" },
      { event: "message", data: " two spaces", id: "7" },
      { event: "message", data: "x", id: "7", retry: 3000 },
    ]);
  });

  it("does not send an event without data, nor the last event without its blank line", async () => {
    expect(await events("event: ping\n\nid: 1\n\ndata: kept\n\ndata: lost")).toEqual([{ event: "message", data: "kept", id: "1" }]);
  });

  it("resets the event ID with an empty id, and ignores an id with NUL and a bad retry", async () => {
    expect(await events("id: 5\ndata: a\n\nid\ndata: b\n\nid: x\u0000y\nretry: 1s\ndata: c\n\n")).toEqual([
      { event: "message", data: "a", id: "5" },
      { event: "message", data: "b" },
      { event: "message", data: "c" },
    ]);
  });

  it("accepts CR, LF and CRLF as line ends, also across chunks", async () => {
    const text = "﻿data: a\rdata: é\r\n\r\ndata: b\n\ndata: c\r\r";
    const expected = [
      { event: "message", data: "a\né" },
      { event: "message", data: "b" },
      { event: "message", data: "c" },
    ];
    for (const [first, second] of splits(text)) {
      expect(await collect(sseEvents(chunksOf(first, second), 1000))).toEqual(expected);
    }
    // An empty chunk between a CR and its LF
    expect(await collect(sseEvents(chunksOf("data: a\r", "", "\n\r\n"), 1000))).toEqual([{ event: "message", data: "a" }]);
  });

  it("refuses an event of more than maxEventBytes bytes", async () => {
    await expect(events("data: 123\ndata: 456\n\n", 8)).resolves.toEqual([{ event: "message", data: "123\n456" }]);
    await expect(events("data: 1234\ndata: 5678\n\n", 8)).rejects.toMatchObject({ code: "EVENT_TOO_LARGE" });
    const endless = async function* (): AsyncGenerator<Uint8Array> {
      yield Buffer.from("data: ");
      for (;;) yield Buffer.alloc(1000, 0x61);
    };
    await expect(collect(sseEvents(endless(), 5000))).rejects.toBeInstanceOf(HttpError);
  });
});
