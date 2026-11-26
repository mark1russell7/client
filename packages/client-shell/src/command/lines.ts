/**
 * The split of a stream of output into lines. The output comes in chunks, and a chunk can end in
 * the middle of a line or of a character. The splitter keeps that part until the rest comes. The
 * splitter is pure state with no I/O, so a caller with its own pipes uses it too.
 */

import { StringDecoder } from "node:string_decoder";

/** The longest line of a splitter by default: 1 MiB of characters. */
export const DEFAULT_MAX_LINE_LENGTH = 1024 * 1024;

/** The options of `createLineSplitter`. */
export interface LineSplitterOptions {
  /** A longer line comes out in parts of this many characters (default: 1 MiB). */
  maxLineLength?: number | undefined;
  /** The encoding of a chunk of bytes (default: utf8). A chunk of text is not decoded. */
  encoding?: BufferEncoding | undefined;
}

/** The splitter of a stream of output into lines. */
export interface LineSplitter {
  /** This method adds one chunk, and gives each complete line in it. A line has no line end. */
  push(chunk: string | Uint8Array): string[];
  /** This method gives the last part of the stream, at the end of the stream. The splitter is then empty. */
  flush(): string[];
}

/**
 * This function makes a splitter of a stream into lines.
 *
 * - A line ends at `\n` or at `\r\n`. At the end of the stream, a last part with no line end is a line.
 * - A chunk of bytes uses `encoding`. A character that a chunk cuts waits for the next chunk.
 * - A line longer than `maxLineLength` comes out in parts of `maxLineLength` characters. A full part
 *   comes out before the end of its line arrives, so one line cannot fill the memory.
 *
 * The function throws a `TypeError` for an encoding that `Buffer` does not know.
 */
export function createLineSplitter(options: LineSplitterOptions = {}): LineSplitter {
  const maxLineLength = Math.max(1, Math.floor(options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH));
  const encoding = options.encoding ?? "utf8";
  if (!Buffer.isEncoding(encoding)) throw new TypeError("Unknown encoding: " + String(encoding));
  const decoder = new StringDecoder(encoding);
  let partial = "";
  const parts = (line: string, lines: string[]): void => {
    if (line.length <= maxLineLength) {
      lines.push(line);
      return;
    }
    for (let at = 0; at < line.length; at += maxLineLength) lines.push(line.slice(at, at + maxLineLength));
  };
  return {
    push(chunk) {
      const text = typeof chunk === "string" ? chunk : decoder.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      const split = (partial + text).split(/\r?\n/);
      let rest = split.pop() ?? "";
      const lines: string[] = [];
      for (const line of split) parts(line, lines);
      // A line without its end yet: give its full parts now, but keep a part that is not empty. Thus the
      // end of a line that fills its last part adds no empty line. A last \r waits, because a \n can follow it.
      const open = rest.endsWith("\r") ? rest.length - 1 : rest.length;
      if (open > maxLineLength) {
        const whole = Math.floor((open - 1) / maxLineLength) * maxLineLength;
        parts(rest.slice(0, whole), lines);
        rest = rest.slice(whole);
      }
      partial = rest;
      return lines;
    },
    flush() {
      let rest = partial + decoder.end();
      partial = "";
      if (rest.endsWith("\r")) rest = rest.slice(0, -1);
      const lines: string[] = [];
      if (rest.length > 0) parts(rest, lines);
      return lines;
    },
  };
}
