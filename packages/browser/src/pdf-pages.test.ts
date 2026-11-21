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
      "2 0 obj\n<< /Type /Pages /Kids [] /Count 1 >>\nendobj",
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

  it("ignores a key in a nested dictionary, in a string and in a comment", () => {
    const file = pdf(
      catalog,
      "2 0 obj\n<< /Type /Pages /Resources << /Count 99 >> /Title (a /Count 77 >> \\) text) /Note <2F436F756E74> % /Count 55\n/Count 5 /Kids [] >>\nendobj",
      trailer(3),
    );
    expect(pdfPageCount(file)).toBe(5);
  });

  it("does not read an object or a trailer from the bytes of a stream", () => {
    // The stream comes after the last trailer, so a false trailer in it is the last one of the file.
    const data = Buffer.from("2 0 obj\n<< /Type /Pages /Count 50 >>\nendobj\ntrailer\n<< /Root 9 0 R >>", "latin1");
    const file = pdf(catalog, "2 0 obj\n<< /Type /Pages /Kids [] /Count 6 >>\nendobj", trailer(4), stream(3, "/Type /Metadata", data));
    expect(pdfPageCount(file)).toBe(6);
  });

  it("accepts a view of a part of a larger buffer", () => {
    const file = pdf(catalog, "2 0 obj\n<< /Type /Pages /Kids [] /Count 7 >>\nendobj", trailer(3));
    const larger = Buffer.concat([Buffer.from("junk"), file, Buffer.from("junk")]);
    expect(pdfPageCount(larger.subarray(4, 4 + file.length))).toBe(7);
  });

  it("refuses data that is not a PDF file", () => {
    expect(() => pdfPageCount(Buffer.from("<html></html>"))).toThrow(/not a PDF file/);
  });

  it("refuses a file with no trailer, no catalog or no page tree", () => {
    expect(() => pdfPageCount(pdf(catalog))).toThrow(/no trailer/);
    expect(() => pdfPageCount(pdf(trailer(1)))).toThrow(/catalog \(object 1\) is not in the file/);
    expect(() => pdfPageCount(pdf("1 0 obj\n<< /Type /Catalog >>\nendobj", trailer(2)))).toThrow(/has no \/Pages/);
    expect(() => pdfPageCount(pdf(catalog, page(2, 2), trailer(3)))).toThrow(/not the root of a page tree/);
    expect(() => pdfPageCount(pdf(catalog, "2 0 obj\n<< /Type /Pages /Count 4 0 R >>\nendobj", trailer(3)))).toThrow(/no \/Count number/);
  });

  it("does not read an object stream with a filter that it does not know", () => {
    const objects = "<< /Type /Catalog /Pages 2 0 R >> << /Type /Pages /Kids [] /Count 3 >>";
    const file = pdf(stream(5, "/Type /ObjStm /N 2 /First 8 /Filter /LZWDecode", Buffer.from(`1 0 2 34 ${objects}`, "latin1")), trailer(6));
    expect(() => pdfPageCount(file)).toThrow(/cannot read/);
  });
});
