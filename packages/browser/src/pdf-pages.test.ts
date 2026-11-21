import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { pdfPageCount } from "./pdf-pages.js";

/** This function makes the bytes of a made-up PDF file from its parts. A part is text or bytes. */
function pdf(...parts: (string | Buffer)[]): Uint8Array {
  return Buffer.concat(["%PDF-1.7\n", ...parts, "%%EOF\n"].map((part) => (typeof part === "string" ? Buffer.from(`${part}\n`, "latin1") : part)));
}

/** This function makes the bytes of a stream object: the dictionary gets the /Length of the data. */
function stream(num: number, dict: string, data: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${num} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"),
    data,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
}

const catalog = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj";
const page = (num: number, parent: number): string => `${num} 0 obj\n<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 612 792] >>\nendobj`;
const pages = (count: number): string => `2 0 obj\n<< /Type /Pages /Kids [] /Count ${count} >>\nendobj`;
const trailer = (size: number): string => `xref\n0 ${size}\ntrailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n0`;

describe("pdfPageCount", () => {
  it("reads the count of a flat page tree", () => {
    const file = pdf(catalog, "2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj", page(3, 2), page(4, 2), trailer(5));
    expect(pdfPageCount(file)).toBe(2);
  });

  it("reads the count of the root, not of a child node of the tree", () => {
    // Chrome writes a tree like this one: the child nodes come before the root in the file.
    const file = pdf(
      catalog,
      "5 0 obj\n<< /Type /Pages /Count 8 /Kids [3 0 R] /Parent 2 0 R >>\nendobj",
      "6 0 obj\n<< /Type /Pages /Count 2 /Kids [4 0 R] /Parent 2 0 R >>\nendobj",
      "2 0 obj\n<< /Type /Pages /Count 10 /Kids [5 0 R 6 0 R] >>\nendobj",
      trailer(7),
    );
    expect(pdfPageCount(file)).toBe(10);
  });

  it("reads the last version of a file with an incremental update", () => {
    const file = pdf(
      catalog,
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
      page(3, 2),
      trailer(4),
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj",
      page(4, 2),
      "xref\n0 1\ntrailer\n<< /Size 5 /Root 1 0 R /Prev 0 >>\nstartxref\n0",
    );
    expect(pdfPageCount(file)).toBe(2);
  });

  it("follows a new catalog of an update", () => {
    const file = pdf(
      catalog,
      pages(1),
      trailer(3),
      "7 0 obj\n<< /Type /Catalog /Pages 8 0 R >>\nendobj",
      "8 0 obj\n<< /Type /Pages /Kids [] /Count 4 >>\nendobj",
      "xref\n0 1\ntrailer\n<< /Size 9 /Root 7 0 R /Prev 0 >>\nstartxref\n0",
    );
    expect(pdfPageCount(file)).toBe(4);
  });

  it("reads the objects of an object stream and the /Root of a cross-reference stream", () => {
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 3 >>"];
    const header = `1 0 2 ${objects[0]!.length + 1} `;
    const body = Buffer.from(header + objects.join(" "), "latin1");
    const file = pdf(
      stream(5, `/Type /ObjStm /N 2 /First ${header.length} /Filter /FlateDecode`, deflateSync(body)),
      page(3, 2),
      stream(6, "/Type /XRef /Size 7 /Root 1 0 R /W [1 2 1] /Filter /FlateDecode", deflateSync(Buffer.alloc(8))),
      "startxref\n0",
    );
    expect(pdfPageCount(file)).toBe(3);
  });

  it("reads an object stream with no filter, and skips its objects that are not dictionaries", () => {
    const objects = ["42", "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [] /Count 8 >>", "<< /Damaged (no end"];
    const offsets = objects.map((_, index) => objects.slice(0, index).reduce((sum, object) => sum + object.length + 1, 0));
    const header = `4 ${offsets[0]} 1 ${offsets[1]} 2 ${offsets[2]} 9 ${offsets[3]} `;
    const body = Buffer.from(header + objects.join(" "), "latin1");
    const file = pdf(stream(5, `/Type /ObjStm /N 4 /First ${header.length}`, body), trailer(6));
    expect(pdfPageCount(file)).toBe(8);
  });

  it.each([
    ["a filter that it does not know", "/N 2 /First 9 /Filter /LZWDecode", (body: Buffer): Buffer => body],
    ["two filters", "/N 2 /First 9 /Filter [/ASCIIHexDecode /FlateDecode]", (body: Buffer): Buffer => body],
    ["the parameters of a filter", "/N 2 /First 9 /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 4 >>", deflateSync],
    ["data that does not inflate", "/N 2 /First 9 /Filter /FlateDecode", (): Buffer => Buffer.from("not deflate data")],
    ["no /N", "/First 9 /Filter /FlateDecode", deflateSync],
    ["no /First", "/N 2 /Filter /FlateDecode", deflateSync],
    ["a header that is not numbers", "/N 2 /First 9", (body: Buffer): Buffer => Buffer.from(body.toString("latin1").replace("1 0 2", "a 0 b"), "latin1")],
  ])("does not read an object stream with %s", (_case, dict, encode) => {
    const body = Buffer.from("1 0 2 34 << /Type /Catalog /Pages 2 0 R >> << /Type /Pages /Kids [] /Count 3 >>", "latin1");
    const file = pdf(stream(5, `/Type /ObjStm ${dict}`, encode(body)), trailer(6));
    expect(() => pdfPageCount(file)).toThrow(/cannot read/);
  });

  it("ignores a key in a nested dictionary, in a string and in a comment", () => {
    const file = pdf(
      catalog,
      "2 0 obj\n<< /Type /Pages /Resources << /Count 99 /Font << /F1 (x) /Count 98 >> /Id <00> >> /Title (a /Count 77 >> \\) text) /Note <2F436F756E74> % /Count 55\n/Count 5 /Kids [] >>\nendobj",
      trailer(3),
    );
    expect(pdfPageCount(file)).toBe(5);
  });

  it("skips a plain object that is not a dictionary", () => {
    const file = pdf("3 0 obj\n42\nendobj", "4 0 obj\n[1 0 R (text)]\nendobj", catalog, pages(2), trailer(5));
    expect(pdfPageCount(file)).toBe(2);
  });

  it("reads a file with CR LF line ends and comments between the tokens", () => {
    const file = pdf(
      "1 0 obj % the catalog\r\n<< /Type /Catalog /Pages 2 0 R >>\r\nendobj",
      "2 0 obj\r\n% the root of the page tree\r\n<< /Type /Pages /Kids [] /Count 3 >>\r\nendobj",
      "3 0 obj\r\n<< /Length 4 >>\r\nstream\r\nabcd\r\nendstream\r\nendobj",
      "% the trailer comes last",
      "xref\r\n0 4\r\ntrailer\r\n<< /Size 4 /Root 1 0 R >>\r\nstartxref\r\n0",
    );
    expect(pdfPageCount(file)).toBe(3);
  });

  it("does not read an object or a trailer from the bytes of a stream", () => {
    // The stream comes after the last trailer, so a false trailer in it is the last one of the file.
    const data = Buffer.from("2 0 obj\n<< /Type /Pages /Count 50 >>\nendobj\ntrailer\n<< /Root 9 0 R >>", "latin1");
    const file = pdf(catalog, pages(6), trailer(4), stream(3, "/Type /Metadata", data));
    expect(pdfPageCount(file)).toBe(6);
  });

  it.each([
    ["an indirect /Length", "/Length 9 0 R"],
    ["a wrong /Length", "/Length 3"],
  ])("finds the end of a stream with %s", (_case, length) => {
    // The data of the stream has a false page tree, so a wrong end of the stream gives a wrong count.
    const data = "2 0 obj << /Type /Pages /Count 70 >> endobj trailer << /Root 1 0 R >>";
    const file = pdf(catalog, pages(6), trailer(4), `3 0 obj\n<< ${length} >>\nstream\n${data}\nendstream\nendobj`);
    expect(pdfPageCount(file)).toBe(6);
  });

  it.each([
    ["a string", "9 0 obj\n<< /A (no end"],
    ["a hex string", "9 0 obj\n<< /A <00"],
    ["a nested dictionary", "9 0 obj\n<< /A << /B 1"],
    ["a trailer", "trailer\n<< /Size 9 /Root 7 0 R"],
    ["the data of a stream", "9 0 obj\n<< /Length 50 >>\nstream\nabc"],
  ])("ignores a damaged end of the file: %s with no end", (_case, tail) => {
    const file = pdf(catalog, pages(6), trailer(3), tail);
    expect(pdfPageCount(file)).toBe(6);
  });

  it("accepts a view of a part of a larger buffer", () => {
    const file = pdf(catalog, pages(7), trailer(3));
    const larger = Buffer.concat([Buffer.from("junk"), file, Buffer.from("junk")]);
    expect(pdfPageCount(larger.subarray(4, 4 + file.length))).toBe(7);
  });

  it("refuses data that is not a PDF file", () => {
    expect(() => pdfPageCount(Buffer.from("<html></html>"))).toThrow(/not a PDF file/);
  });

  it("refuses a file with no trailer, no catalog or no page tree", () => {
    expect(() => pdfPageCount(pdf(catalog))).toThrow(/no trailer/);
    expect(() => pdfPageCount(pdf(catalog, pages(1), "xref\n0 1\ntrailer\n<< /Size 1 >>\nstartxref\n0"))).toThrow(/no trailer with a \/Root/);
    expect(() => pdfPageCount(pdf(trailer(1)))).toThrow(/catalog \(object 1\) is not in the file/);
    expect(() => pdfPageCount(pdf("1 0 obj\n<< /Type /Catalog >>\nendobj", trailer(2)))).toThrow(/has no \/Pages/);
    expect(() => pdfPageCount(pdf(catalog, page(2, 2), trailer(3)))).toThrow(/object 2 is not the root of a page tree/);
    expect(() => pdfPageCount(pdf(catalog, trailer(3)))).toThrow(/object 2 is not the root of a page tree/);
    expect(() => pdfPageCount(pdf(catalog, "2 0 obj\n<< /Type /Pages /Count 4 0 R >>\nendobj", trailer(3)))).toThrow(/no \/Count number/);
  });
});
