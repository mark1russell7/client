/**
 * The stream parsers of the HTTP procedures: the lines of NDJSON and the events of an event
 * stream (the `text/event-stream` format of the HTML standard). Each parser reads chunks of
 * bytes, so a line or a character can arrive in two chunks.
 */

import { HttpError } from "./errors.js";

/** One line of an NDJSON stream. */
export interface NdjsonLine {
  /** The number of the line: the first line is 1. Blank lines count. */
  readonly line: number;
  readonly text: string;
}

const LF = 0x0a;
const CR = 0x0d;

function bytesOf(chunk: Uint8Array | string): Buffer {
  return typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

/**
 * This function gives each line of a stream of bytes that is not blank. A line ends at LF, and a
 * CR before the LF is removed. A line of more than `maxLineBytes` bytes throws `LINE_TOO_LARGE`.
 * The last line can end without LF. A byte order mark at the start is removed.
 */
export async function* ndjsonLines(chunks: AsyncIterable<Uint8Array | string>, maxLineBytes: number, label = "http.ndjson"): AsyncGenerator<NdjsonLine, void, undefined> {
  let pending: Buffer[] = [];
  let pendingSize = 0;
  let number = 0;
  const tooLarge = (): HttpError => new HttpError("LINE_TOO_LARGE", `${label}: line ${number + 1} has more than ${maxLineBytes} bytes (maxLineBytes)`);
  const finish = (last: Buffer): NdjsonLine | undefined => {
    let bytes = pending.length === 0 ? last : Buffer.concat([...pending, last]);
    pending = [];
    pendingSize = 0;
    if (bytes.length > 0 && bytes[bytes.length - 1] === CR) bytes = bytes.subarray(0, bytes.length - 1);
    if (bytes.length > maxLineBytes) throw tooLarge();
    number++;
    let text = bytes.toString("utf8");
    if (number === 1 && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text.trim() === "" ? undefined : { line: number, text };
  };
  for await (const chunk of chunks) {
    const buffer = bytesOf(chunk);
    let start = 0;
    for (;;) {
      const end = buffer.indexOf(LF, start);
      if (end < 0) break;
      if (pendingSize + (end - start) > maxLineBytes + 1) throw tooLarge();
      const line = finish(buffer.subarray(start, end));
      if (line) yield line;
      start = end + 1;
    }
    if (start < buffer.length) {
      const rest = buffer.subarray(start);
      pendingSize += rest.length;
      // One more byte for a CR before the LF
      if (pendingSize > maxLineBytes + 1) throw tooLarge();
      pending.push(Buffer.from(rest));
    }
  }
  if (pendingSize > 0) {
    const line = finish(Buffer.alloc(0));
    if (line) yield line;
  }
}

/** One server-sent event. */
export interface ServerSentEvent {
  /** The type of the event: the `event` field, or `message`. */
  readonly event: string;
  /** The data: the `data` fields of the event, joined with LF. */
  readonly data: string;
  /** The last event ID: the last `id` field of the stream, when it is not empty. */
  readonly id?: string;
  /** The reconnection time that the event gave with a `retry` field, in milliseconds. */
  readonly retry?: number;
}

/**
 * This function gives each event of an event stream. It obeys the parse rules of the HTML
 * standard: a line ends at CR, LF or CRLF, a blank line sends the event, a line that starts with a
 * colon is a comment, and an event without data is not sent. An event of more than
 * `maxEventBytes` bytes throws `EVENT_TOO_LARGE`. At the end of the stream, an event without its
 * blank line is not sent.
 */
export async function* sseEvents(chunks: AsyncIterable<Uint8Array | string>, maxEventBytes: number, label = "http.sse"): AsyncGenerator<ServerSentEvent, void, undefined> {
  // The decoder removes the byte order mark and keeps a character whose bytes are in two chunks
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let skipLf = false;
  let data = "";
  let dataBytes = 0;
  let eventType = "";
  let lastEventId = "";
  let retry: number | undefined;
  const tooLarge = (): HttpError => new HttpError("EVENT_TOO_LARGE", `${label}: an event has more than ${maxEventBytes} bytes (maxEventBytes)`);

  /** The event of a blank line, or undefined. */
  const dispatch = (): ServerSentEvent | undefined => {
    const event: ServerSentEvent | undefined =
      data === ""
        ? undefined
        : {
            event: eventType === "" ? "message" : eventType,
            data: data.endsWith("\n") ? data.slice(0, -1) : data,
            ...(lastEventId !== "" ? { id: lastEventId } : {}),
            ...(retry !== undefined ? { retry } : {}),
          };
    data = "";
    dataBytes = 0;
    eventType = "";
    retry = undefined;
    return event;
  };

  const field = (line: string): void => {
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const name = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (name) {
      case "event":
        eventType = value;
        break;
      case "data":
        dataBytes += Buffer.byteLength(value) + 1;
        if (dataBytes > maxEventBytes + 1) throw tooLarge();
        data += `${value}\n`;
        break;
      case "id":
        if (!value.includes("\u0000")) lastEventId = value;
        break;
      case "retry":
        if (/^[0-9]+$/.test(value)) retry = Number(value);
        break;
      default:
        break;
    }
  };

  const lines = function* (text: string, end: boolean): Generator<string> {
    buffer += text;
    let start = 0;
    if (skipLf && buffer.length > 0) {
      if (buffer.charCodeAt(0) === 0x0a) start = 1;
      skipLf = false;
    }
    for (let i = start; i < buffer.length; i++) {
      const code = buffer.charCodeAt(i);
      if (code !== 0x0a && code !== 0x0d) continue;
      yield buffer.slice(start, i);
      if (code === 0x0d) {
        if (i + 1 < buffer.length) {
          if (buffer.charCodeAt(i + 1) === 0x0a) i++;
        } else {
          // A CR at the end of a chunk: an LF at the start of the next chunk is the same line end
          skipLf = true;
        }
      }
      start = i + 1;
    }
    buffer = buffer.slice(start);
    if (!end && buffer.length > maxEventBytes) throw tooLarge();
  };

  const feed = function* (text: string, end: boolean): Generator<ServerSentEvent> {
    for (const line of lines(text, end)) {
      if (line === "") {
        const event = dispatch();
        if (event) yield event;
      } else {
        field(line);
      }
    }
  };

  for await (const chunk of chunks) {
    yield* feed(typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }), false);
  }
  yield* feed(decoder.decode(), true);
}
