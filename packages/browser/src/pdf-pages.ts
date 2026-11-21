/**
 * The page count of a PDF file, with no package other than `node:zlib`. The count comes from the
 * page tree of the last trailer. The trailer gives the catalog (`/Root`). The catalog gives the
 * root of the page tree (`/Pages`). The `/Count` of that root is the number of pages.
 *
 * - The reader finds the plain objects, and the objects of each object stream (`/Type /ObjStm`
 *   with no filter, or with the filter `/FlateDecode`).
 * - For each object number, the last definition in the file counts. Thus the count of a file with
 *   incremental updates is the count of its last version.
 * - The reader does not decrypt. An encrypted file with its page tree in an object stream gives an
 *   error.
 */

import { constants, inflateSync } from "node:zlib";

/** The pattern of the start of a plain object: `<number> <generation> obj`. */
const OBJECT = /(\d+)\s+\d+\s+obj\b/g;
/** The pattern of the keyword of a classic trailer. */
const TRAILER = /\btrailer\b/g;
/** The pattern of a name: a slash, then the characters up to a delimiter or a white space. */
const NAME = /\/([^\s/<>[\]()]+)/g;
/** The PDF white-space characters: NUL, tab, line feed, form feed, carriage return and space. */
const SPACE = new Set(["\0", "\t", "\n", "\f", "\r", " "]);

/** A dictionary of the file: its top level, and the position after its end. */
interface Dict {
  /** The text of the top level. It has no nested dictionary, string or comment. */
  readonly top: string;
  /** The position after the `>>` of the dictionary. */
  readonly end: number;
}

/**
 * This function gives the number of pages of a PDF file, from its bytes. It throws when the data
 * is not a PDF file, or when it finds no trailer, catalog or page tree that it can read.
 */
export function pdfPageCount(pdf: Uint8Array): number {
  const text = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength).toString("latin1");
  if (!text.slice(0, 1024).includes("%PDF-")) throw new Error("pdfPageCount: the data is not a PDF file (it has no %PDF- header)");
  const { objects, roots } = readObjects(text);
  const root = roots.at(-1);
  if (root === undefined) throw new Error("pdfPageCount: the file has no trailer with a /Root");
  const catalog = objects.get(root.ref);
  if (catalog === undefined) {
    throw new Error(`pdfPageCount: the catalog (object ${root.ref}) is not in the file, or it is in a stream that the function cannot read`);
  }
  const pagesRef = reference(catalog, "Pages");
  if (pagesRef === undefined) throw new Error(`pdfPageCount: the catalog (object ${root.ref}) has no /Pages`);
  const pages = objects.get(pagesRef);
  if (pages === undefined || name(pages, "Type") !== "Pages") {
    throw new Error(`pdfPageCount: object ${pagesRef} is not the root of a page tree`);
  }
  const count = integer(pages, "Count");
  if (count === undefined) throw new Error(`pdfPageCount: the page tree (object ${pagesRef}) has no /Count number`);
  return count;
}

/**
 * This function reads the top level of the dictionary of each object, and the `/Root` of each
 * trailer, in the sequence of the file.
 */
function readObjects(text: string): { objects: Map<number, string>; roots: { ref: number; at: number }[] } {
  // The definitions come in the sequence of the file, so a later definition of a number replaces the earlier one.
  const objects = new Map<number, string>();
  const define = (num: number, top: string): void => void objects.set(num, top);
  const roots: { ref: number; at: number }[] = [];
  // The start and the end of the data of each stream
  const streams: [number, number][] = [];
  const noteRoot = (top: string, at: number): void => {
    const ref = reference(top, "Root");
    if (ref !== undefined) roots.push({ ref, at });
  };

  const objectPattern = new RegExp(OBJECT.source, "g");
  for (let match = objectPattern.exec(text); match !== null; match = objectPattern.exec(text)) {
    const at = match.index;
    const start = skipSpace(text, objectPattern.lastIndex);
    // An object that is not a dictionary (a number, an array, a string) has no page tree. The scan
    // goes on after the keyword "obj" of a damaged dictionary that does not end.
    const dict = text.startsWith("<<", start) ? readDict(text, start) : undefined;
    if (dict === undefined) continue;
    define(Number(match[1]), dict.top);
    // A cross-reference stream (PDF 1.5) holds the keys of the trailer, and /Root with them.
    if (name(dict.top, "Type") === "XRef") noteRoot(dict.top, at);
    const after = skipSpace(text, dict.end);
    if (!text.startsWith("stream", after)) {
      objectPattern.lastIndex = dict.end;
      continue;
    }
    // The data starts after the end of line of the keyword: CR LF, or LF.
    const keywordEnd = after + "stream".length;
    const dataStart = keywordEnd + (text.startsWith("\r\n", keywordEnd) ? 2 : 1);
    const length = integer(dict.top, "Length");
    const dataEnd =
      length !== undefined && text.startsWith("endstream", skipSpace(text, dataStart + length))
        ? dataStart + length
        : text.indexOf("endstream", dataStart);
    if (dataEnd < 0) {
      // A stream with no end holds the rest of the file.
      streams.push([dataStart, text.length]);
      break;
    }
    streams.push([dataStart, dataEnd]);
    if (name(dict.top, "Type") === "ObjStm") readObjectStream(text.slice(dataStart, dataEnd), dict.top, define);
    // The scan goes on after the data, so the bytes of a stream never give an object.
    objectPattern.lastIndex = dataEnd + "endstream".length;
  }

  const trailerPattern = new RegExp(TRAILER.source, "g");
  for (let match = trailerPattern.exec(text); match !== null; match = trailerPattern.exec(text)) {
    const at = match.index;
    // The word "trailer" in the data of a stream is not a trailer.
    if (streams.some(([start, end]) => at >= start && at < end)) continue;
    const start = skipSpace(text, trailerPattern.lastIndex);
    const dict = text.startsWith("<<", start) ? readDict(text, start) : undefined;
    if (dict !== undefined) noteRoot(dict.top, at);
  }
  roots.sort((a, b) => a.at - b.at);
  return { objects, roots };
}

/** This function reads the dictionaries of an object stream. It reads nothing from a stream that it cannot decode. */
function readObjectStream(raw: string, dict: string, define: (num: number, top: string) => void): void {
  const data = decode(raw, dict);
  const count = integer(dict, "N");
  const first = integer(dict, "First");
  if (data === undefined || count === undefined || first === undefined) return;
  // The header gives pairs of numbers: the number of each object, and its offset after /First.
  const header = data.slice(0, first).trim().split(/\s+/).map(Number);
  if (!header.every((value) => Number.isInteger(value))) return;
  const objects = Math.min(count, Math.floor(header.length / 2));
  for (let index = 0; index < objects; index += 1) {
    const start = skipSpace(data, first + header[2 * index + 1]!);
    const object = data.startsWith("<<", start) ? readDict(data, start) : undefined;
    if (object !== undefined) define(header[2 * index]!, object.top);
  }
}

/** This function gives the data of a stream with no filter, or with the one filter `/FlateDecode` and no parameters. Else it gives `undefined`. */
function decode(raw: string, dict: string): string | undefined {
  const filter = /\/Filter\s*(\[[^\]]*\]|\/[^\s/<>[\]()]+)/.exec(dict)?.[1] ?? "";
  const filters = [...filter.matchAll(NAME)].map((match) => match[1]);
  if (filters.length === 0) return raw;
  if (filters.length > 1 || filters[0] !== "FlateDecode" || /\/DecodeParms/.test(dict)) return undefined;
  try {
    return inflateSync(Buffer.from(raw, "latin1"), { finishFlush: constants.Z_SYNC_FLUSH }).toString("latin1");
  } catch {
    // An encrypted or a damaged stream gives no data.
    return undefined;
  }
}

/** This function gives the first position at or after `from` that is not white space or a comment. */
function skipSpace(text: string, from: number): number {
  let index = from;
  while (index < text.length) {
    const char = text[index]!;
    if (SPACE.has(char)) index += 1;
    else if (char === "%") index = lineEnd(text, index);
    else break;
  }
  return index;
}

/** This function gives the position after the end of the line at `from`. */
function lineEnd(text: string, from: number): number {
  let index = from;
  while (index < text.length && text[index] !== "\n" && text[index] !== "\r") index += 1;
  return index + 1;
}

/** This function gives the position after the literal string that starts at `from`, with its nested parentheses and escapes, or -1. */
function stringEnd(text: string, from: number): number {
  let depth = 0;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") index += 1;
    else if (char === "(") depth += 1;
    else if (char === ")" && --depth === 0) return index + 1;
  }
  return -1;
}

/**
 * This function reads the dictionary that starts at `from` (at `<<`), in one pass. It gives
 * `undefined` when the dictionary does not end.
 *
 * - The top level gets each character of the dictionary at depth 1.
 * - A nested dictionary, a string or a comment at each depth gives a placeholder (`<<>>`, `()`, `<>`
 *   or a space) in the top level. Thus a key in them does not count, and the tokens of the top level
 *   stay apart.
 */
function readDict(text: string, from: number): Dict | undefined {
  let depth = 0;
  let top = "";
  let index = from;
  while (index < text.length) {
    const char = text[index];
    if (text.startsWith("<<", index)) {
      if (depth > 0) top += " <<>> ";
      depth += 1;
      index += 2;
    } else if (text.startsWith(">>", index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) return { top, end: index };
    } else if (char === "(") {
      index = stringEnd(text, index);
      if (index < 0) return undefined;
      top += " () ";
    } else if (char === "<") {
      // A hex string
      const close = text.indexOf(">", index);
      if (close < 0) return undefined;
      top += " <> ";
      index = close + 1;
    } else if (char === "%") {
      top += " ";
      index = lineEnd(text, index);
    } else {
      if (depth === 1) top += char;
      index += 1;
    }
  }
  return undefined;
}

/** This function gives the name value of a key (`/Type /Pages` gives `Pages`). */
function name(dict: string, key: string): string | undefined {
  return new RegExp(`/${key}\\s*/([^\\s/<>\\[\\]()]+)`).exec(dict)?.[1];
}

/** This function gives the direct integer value of a key. A reference (`5 0 R`) gives `undefined`. */
function integer(dict: string, key: string): number | undefined {
  const value = new RegExp(`/${key}\\s+(\\d+)\\b(?!\\s+\\d+\\s+R\\b)`).exec(dict)?.[1];
  return value === undefined ? undefined : Number(value);
}

/** This function gives the object number of a reference value of a key (`/Root 1 0 R` gives 1). */
function reference(dict: string, key: string): number | undefined {
  const value = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R\\b`).exec(dict)?.[1];
  return value === undefined ? undefined : Number(value);
}
