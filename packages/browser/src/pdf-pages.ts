/**
 * The page count of a PDF file, with no package other than `node:zlib`. The count comes from the
 * page tree of the last trailer. The trailer gives the catalog (`/Root`). The catalog gives the
 * root of the page tree (`/Pages`). The `/Count` of that root is the number of pages.
 *
 * - The reader finds the plain objects, and the objects of each object stream (`/Type /ObjStm`
 *   with the filter `/FlateDecode`).
 * - For each object number, the last definition in the file counts. Thus the count of a file with
 *   incremental updates is the count of its last version.
 * - The reader does not decrypt. An encrypted file with its page tree in an object stream gives an
 *   error.
 */

import { constants, inflateSync } from "node:zlib";

/** The dictionary of an object at its top level, and the position of its definition in the file. */
interface Definition {
  readonly dict: string;
  readonly at: number;
}

/** The pattern of the start of a plain object: `<number> <generation> obj`. */
const OBJECT = /(\d+)\s+\d+\s+obj\b/g;
/** The pattern of the keyword of a classic trailer. */
const TRAILER = /\btrailer\b/g;
/** The PDF white-space characters: NUL, tab, line feed, form feed, carriage return and space. */
const SPACE = new Set(["\0", "\t", "\n", "\f", "\r", " "]);

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
  const pagesRef = reference(catalog.dict, "Pages");
  if (pagesRef === undefined) throw new Error(`pdfPageCount: the catalog (object ${root.ref}) has no /Pages`);
  const pages = objects.get(pagesRef);
  if (pages === undefined || name(pages.dict, "Type") !== "Pages") {
    throw new Error(`pdfPageCount: object ${pagesRef} is not the root of a page tree`);
  }
  const count = integer(pages.dict, "Count");
  if (count === undefined) throw new Error(`pdfPageCount: the page tree (object ${pagesRef}) has no /Count number`);
  return count;
}

/** This function reads the dictionaries of the objects of a file, and the `/Root` of each trailer, in the sequence of the file. */
function readObjects(text: string): { objects: Map<number, Definition>; roots: { ref: number; at: number }[] } {
  const objects = new Map<number, Definition>();
  const roots: { ref: number; at: number }[] = [];
  // The start and the end of the data of each stream, in the sequence of the file
  const streams: [number, number][] = [];
  const define = (num: number, dict: string, at: number): void => {
    const old = objects.get(num);
    if (old === undefined || old.at <= at) objects.set(num, { dict, at });
  };
  const noteRoot = (dict: string, at: number): void => {
    const ref = reference(dict, "Root");
    if (ref !== undefined) roots.push({ ref, at });
  };

  const objectPattern = new RegExp(OBJECT.source, "g");
  for (let match = objectPattern.exec(text); match !== null; match = objectPattern.exec(text)) {
    const at = match.index;
    const start = skipSpace(text, objectPattern.lastIndex);
    // An object that is not a dictionary (a number, an array, a string) has no page tree.
    if (!text.startsWith("<<", start)) continue;
    const end = dictEnd(text, start);
    if (end < 0) break;
    const dict = topLevel(text.slice(start + 2, end - 2));
    define(Number(match[1]), dict, at);
    // A cross-reference stream (PDF 1.5) holds the keys of the trailer, and /Root with them.
    if (name(dict, "Type") === "XRef") noteRoot(dict, at);
    const after = skipSpace(text, end);
    if (!text.startsWith("stream", after)) {
      objectPattern.lastIndex = end;
      continue;
    }
    // The data starts after the end of line of the keyword: CR LF, or LF.
    let dataStart = after + "stream".length;
    if (text[dataStart] === "\r") dataStart += 1;
    if (text[dataStart] === "\n") dataStart += 1;
    const length = integer(dict, "Length");
    const dataEnd =
      length !== undefined && text.startsWith("endstream", skipSpace(text, dataStart + length))
        ? dataStart + length
        : text.indexOf("endstream", dataStart);
    if (dataEnd < 0) break;
    streams.push([dataStart, dataEnd]);
    if (name(dict, "Type") === "ObjStm") readObjectStream(text.slice(dataStart, dataEnd), dict, at, define);
    // The scan goes on after the data, so the bytes of a stream never give an object.
    objectPattern.lastIndex = dataEnd + "endstream".length;
  }

  const trailerPattern = new RegExp(TRAILER.source, "g");
  for (let match = trailerPattern.exec(text); match !== null; match = trailerPattern.exec(text)) {
    const at = match.index;
    // The word "trailer" in the data of a stream is not a trailer.
    if (streams.some(([start, end]) => at >= start && at < end)) continue;
    const start = skipSpace(text, trailerPattern.lastIndex);
    if (!text.startsWith("<<", start)) continue;
    const end = dictEnd(text, start);
    if (end > 0) noteRoot(topLevel(text.slice(start + 2, end - 2)), at);
  }
  roots.sort((a, b) => a.at - b.at);
  return { objects, roots };
}

/** This function reads the dictionaries of an object stream that has the filter `/FlateDecode` and no predictor. */
function readObjectStream(raw: string, dict: string, at: number, define: (num: number, dict: string, at: number) => void): void {
  const filters = [...(/\/Filter\s*(\[[^\]]*\]|\/[^\s/<>[\]()]+)/.exec(dict)?.[1] ?? "").matchAll(/\/([^\s/<>[\]()]+)/g)].map((m) => m[1]);
  if (filters.length !== 1 || filters[0] !== "FlateDecode") return;
  if (/\/DecodeParms/.test(dict)) return;
  const count = integer(dict, "N");
  const first = integer(dict, "First");
  if (count === undefined || first === undefined) return;
  let data: string;
  try {
    data = inflateSync(Buffer.from(raw, "latin1"), { finishFlush: constants.Z_SYNC_FLUSH }).toString("latin1");
  } catch {
    // An encrypted or a damaged stream gives no objects.
    return;
  }
  const header = data.slice(0, first).trim().split(/\s+/).map(Number);
  for (let index = 0; index + 1 < header.length && index < 2 * count; index += 2) {
    const num = header[index]!;
    const offset = header[index + 1]!;
    if (!Number.isInteger(num) || !Number.isInteger(offset)) return;
    const start = skipSpace(data, first + offset);
    if (!data.startsWith("<<", start)) continue;
    const end = dictEnd(data, start);
    if (end > 0) define(num, topLevel(data.slice(start + 2, end - 2)), at);
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

/** This function gives the position after the literal string that starts at `from`, with its nested parentheses and escapes. */
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

/** This function gives the position after the dictionary that starts at `from` (at `<<`), or -1 when it does not end. */
function dictEnd(text: string, from: number): number {
  let depth = 0;
  let index = from;
  while (index < text.length) {
    if (text.startsWith("<<", index)) {
      depth += 1;
      index += 2;
    } else if (text.startsWith(">>", index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
    } else if (text[index] === "(") {
      index = stringEnd(text, index);
      if (index < 0) return -1;
    } else if (text[index] === "<") {
      // A hex string
      const close = text.indexOf(">", index);
      if (close < 0) return -1;
      index = close + 1;
    } else if (text[index] === "%") {
      index = lineEnd(text, index);
    } else {
      index += 1;
    }
  }
  return -1;
}

/**
 * This function gives the top level of the inside of a dictionary. It removes the nested
 * dictionaries, the strings and the comments, so that a key inside them does not count.
 */
function topLevel(inner: string): string {
  let out = "";
  let index = 0;
  while (index < inner.length) {
    if (inner.startsWith("<<", index)) {
      const end = dictEnd(inner, index);
      if (end < 0) break;
      out += " <<>> ";
      index = end;
    } else if (inner[index] === "(") {
      const end = stringEnd(inner, index);
      if (end < 0) break;
      out += " () ";
      index = end;
    } else if (inner[index] === "<") {
      const close = inner.indexOf(">", index);
      if (close < 0) break;
      out += " <> ";
      index = close + 1;
    } else if (inner[index] === "%") {
      out += " ";
      index = lineEnd(inner, index);
    } else {
      out += inner[index];
      index += 1;
    }
  }
  return out;
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
