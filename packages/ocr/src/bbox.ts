/**
 * The parse of the text layer of a PDF page, in the XHTML output of `pdftotext -bbox-layout` of
 * Poppler. This file starts no process and reads no file.
 *
 * The output has a `page` element with the size of the page, then `flow`, `block`, `line` and
 * `word` elements. Each `line` and each `word` has its box as `xMin`, `yMin`, `xMax` and `yMax`, in
 * PDF points from the top-left corner of the page.
 */

import { makeLine, makeText, type OcrLine, type OcrText, type OcrWord, type Rect } from "./text.js";

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** This function decodes the entities of an XML text: the five named entities and the number entities. */
export function decodeXmlText(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (entity: string, name: string) => {
    if (name.startsWith("#x")) return safeCodePoint(Number.parseInt(name.slice(2), 16), entity);
    if (name.startsWith("#")) return safeCodePoint(Number.parseInt(name.slice(1), 10), entity);
    return ENTITIES[name] ?? entity;
  });
}

function safeCodePoint(code: number, entity: string): string {
  return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
}

/** This function gives the attributes of the start tag of an element, by name. */
function attributes(tag: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) result.set(match[1]!, match[2]!);
  return result;
}

/** This function gives the box of an element from its `xMin`, `yMin`, `xMax` and `yMax`, or undefined. */
function boxOf(tag: string): Rect | undefined {
  const values = attributes(tag);
  const [xMin, yMin, xMax, yMax] = ["xMin", "yMin", "xMax", "yMax"].map((name) => Number(values.get(name)));
  if (![xMin, yMin, xMax, yMax].every((value) => Number.isFinite(value))) return undefined;
  return { x: xMin!, y: yMin!, w: Math.max(0, xMax! - xMin!), h: Math.max(0, yMax! - yMin!) };
}

/**
 * This function parses the output of `pdftotext -bbox-layout` for one page. Each word of the text
 * layer has the confidence 1. The boxes are in PDF points.
 *
 * - The function reads the first `page` element. Give the output of one page (`-f N -l N`).
 * - A word with no text, or with no valid box, is not in the result. A line with no word is not in the result.
 * - A page with no text layer gives no line, and the size of the page.
 *
 * It throws when the output has no `page` element.
 */
export function parsePdftotextBbox(xhtml: string): OcrText {
  const pageStart = /<page\b[^>]*>/.exec(xhtml);
  if (pageStart === null) throw new Error("The output of pdftotext -bbox-layout has no page element");
  const size = attributes(pageStart[0]);
  const width = Number(size.get("width"));
  const height = Number(size.get("height"));
  const pageEnd = xhtml.indexOf("</page>", pageStart.index);
  const body = xhtml.slice(pageStart.index + pageStart[0].length, pageEnd === -1 ? undefined : pageEnd);

  const lines: OcrLine[] = [];
  for (const line of body.matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/g)) {
    const words: OcrWord[] = [];
    for (const word of line[2]!.matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/g)) {
      const text = decodeXmlText(word[2]!).trim();
      const box = boxOf(word[1]!);
      if (text.length > 0 && box !== undefined) words.push({ text, confidence: 1, box });
    }
    if (words.length > 0) lines.push(makeLine(words, boxOf(line[1]!)));
  }
  return makeText(lines, "pt", Number.isFinite(width) ? width : 0, Number.isFinite(height) ? height : 0);
}
