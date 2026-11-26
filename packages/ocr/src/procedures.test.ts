/**
 * The procedures ocr.page and ocr.image with the fake shell of `@procedures/shell/testing`: no
 * program starts, and no real tesseract or Poppler is necessary.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createRegistry, invokePath, outputValue, type ProcedureModule } from "@procedures/client";
import { fakeShell, type FakeShellInput, type FakeShellResult } from "@procedures/shell/testing";
import { createOcrModule, ocrModule, ocrProcedures, type OcrEngine, type OcrHostOptions, type OcrImageOutput, type OcrPageCountOutput, type OcrPageOutput, tesseractEngine } from "./index.js";

const fixture = (name: string): string => readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), "utf8");
const TSV = fixture("tesseract.tsv");
const BBOX = fixture("bbox-layout.html");
const BBOX_EMPTY = fixture("bbox-empty.html");
const PDFINFO = fixture("pdfinfo.txt");

const temp = mkdtempSync(join(tmpdir(), "ocr-test-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const EXECUTABLES = { tesseract: "/opt/tesseract", pdftotext: "/opt/pdftotext", pdftoppm: "/opt/pdftoppm", pdfinfo: "/opt/pdfinfo" };
const HOST: OcrHostOptions = { executables: EXECUTABLES, tempFolder: temp };

/** A fake host: pdftotext gives `layer`, pdftoppm writes the image, tesseract gives the TSV. */
function fakeHost(layer: string, overrides: Partial<Record<string, FakeShellResult>> = {}): (input: FakeShellInput) => FakeShellResult {
  return (input) => {
    const name = input.command.split("/").at(-1)!;
    const override = overrides[name];
    if (override !== undefined) return override;
    if (name === "pdftotext") return { stdout: layer };
    if (name === "pdftoppm") {
      writeFileSync(`${input.args.at(-1)!}.png`, "a made-up image");
      return {};
    }
    return { stdout: TSV };
  };
}

async function call<T>(module: ProcedureModule, shell: ReturnType<typeof fakeShell>, path: [string, string], input: unknown): Promise<T> {
  const registry = createRegistry(shell.module, module);
  return (await outputValue(await invokePath(path, input, { registry }), path)) as T;
}

describe("ocr.page", () => {
  it("gives the text layer of a page with a text layer, and starts no OCR", async () => {
    const shell = fakeShell(fakeHost(BBOX));
    const output = await call<OcrPageOutput>(createOcrModule(HOST), shell, ["ocr", "page"], { file: "menu.pdf", page: 2 });
    expect(output).toMatchObject({ page: 2, source: "text-layer", unit: "pt", width: 612, height: 792, text: 'Fish & chips\n<café> "open"', confidence: 1 });
    expect(output).not.toHaveProperty("engine");
    expect(shell.calls).toHaveLength(1);
    expect(shell.calls[0]).toMatchObject({ command: "/opt/pdftotext", args: ["-f", "2", "-l", "2", "-bbox-layout", "-enc", "UTF-8", resolve("menu.pdf"), "-"], timeout: 120_000 });
  });

  it("uses OCR for a page with no text layer, with the boxes in points and the size of the page", async () => {
    const shell = fakeShell(fakeHost(BBOX_EMPTY));
    const output = await call<OcrPageOutput>(createOcrModule(HOST), shell, ["ocr", "page"], { file: "scan.pdf", language: "eng+deu", psm: 6, timeout: 5000 });
    expect(output).toMatchObject({ page: 1, source: "ocr", engine: "tesseract", unit: "pt", width: 595.276, height: 841.89, text: "Hello world\nTotal 12.50" });
    // 300 dots per inch: a pixel is 72 / 300 = 0.24 points
    expect(output.lines[0]!.box).toEqual({ x: 9.6, y: 7.2, w: 72, h: 9.6 });
    expect(output.lines[0]!.words[0]!.confidence).toBe(0.965);
    expect(shell.calls.map((input) => input.command)).toEqual(["/opt/pdftotext", "/opt/pdftoppm", "/opt/tesseract"]);
    const prefix = shell.args(1).at(-1)!;
    expect(shell.args(1)).toEqual(["-f", "1", "-l", "1", "-r", "300", "-png", "-singlefile", resolve("scan.pdf"), prefix]);
    expect(prefix.startsWith(join(temp, "procedures-ocr-"))).toBe(true);
    expect(shell.args(2)).toEqual([`${prefix}.png`, "stdout", "-l", "eng+deu", "--psm", "6", "--dpi", "300", "tsv"]);
    expect(shell.calls.every((input) => input.timeout === 5000)).toBe(true);
    // The temporary folder is gone after the call
    expect(readdirSync(temp)).toEqual([]);
  });

  it("uses OCR in the mode ocr, also for a page with a text layer, at the resolution of the input", async () => {
    const shell = fakeShell(fakeHost(BBOX));
    const output = await call<OcrPageOutput>(createOcrModule(HOST), shell, ["ocr", "page"], { file: "menu.pdf", mode: "ocr", dpi: 150 });
    expect(output.source).toBe("ocr");
    expect([output.width, output.height]).toEqual([612, 792]);
    // 150 dots per inch: a pixel is 0.48 points
    expect(output.lines[0]!.words[0]!.box).toEqual({ x: 19.2, y: 14.4, w: 62.4, h: 19.2 });
    expect(shell.args(1)).toContain("150");
  });

  it("gives the size of the image in points when the text layer gives no size", async () => {
    const shell = fakeShell(fakeHost('<page width="0" height="0"></page>'));
    const output = await call<OcrPageOutput>(createOcrModule(HOST), shell, ["ocr", "page"], { file: "scan.pdf" });
    expect([output.width, output.height]).toEqual([153.6, 48]);
  });

  it("gives only the text layer in the mode text, also when it is empty", async () => {
    const shell = fakeShell(fakeHost(BBOX_EMPTY));
    const output = await call<OcrPageOutput>(createOcrModule(HOST), shell, ["ocr", "page"], { file: "scan.pdf", mode: "text" });
    expect(output).toMatchObject({ source: "text-layer", text: "", lines: [] });
    expect(shell.calls).toHaveLength(1);
  });

  it("throws when pdftoppm makes no image, and removes the temporary folder", async () => {
    const shell = fakeShell(fakeHost(BBOX_EMPTY, { pdftoppm: {} }));
    await expect(call(createOcrModule(HOST), shell, ["ocr", "page"], { file: "scan.pdf", page: 3 })).rejects.toThrow("pdftoppm made no image of page 3");
    expect(readdirSync(temp)).toEqual([]);
  });

  it("throws the error of a program that fails", async () => {
    const shell = fakeShell(fakeHost(BBOX, { pdftotext: { exitCode: 99, stderr: "Wrong page range given: the first page (9) can not be after the last page (2).\n" } }));
    await expect(call(createOcrModule(HOST), shell, ["ocr", "page"], { file: "menu.pdf", page: 9 })).rejects.toThrow(
      "pdftotext failed (exit code 99): Wrong page range given: the first page (9) can not be after the last page (2).",
    );
  });

  it("throws a typed error when the pdftotext on the path is the one of Xpdf", async () => {
    const xpdf = "pdftotext version 4.00\nCopyright 1996-2017 Glyph & Cog, LLC\nUsage: pdftotext [options] <PDF-file> [<text-file>]\n";
    const shell = fakeShell(fakeHost(BBOX, { pdftotext: { exitCode: 99, stderr: xpdf } }));
    const failure = call(createOcrModule(HOST), shell, ["ocr", "page"], { file: "menu.pdf" });
    await expect(failure).rejects.toMatchObject({ code: "OCR_TOOL_MISSING", tool: "pdftotext", other: "Xpdf", searched: ["/opt/pdftotext"] });
    await expect(failure).rejects.toThrow(/^The program pdftotext at \/opt\/pdftotext is the program of Xpdf, and this package cannot use it\. Install .* or set PDFTOTEXT_EXE or POPPLER_PATH\.$/);
  });

  it("keeps the error of a failed run of Poppler, whose usage text also names Glyph & Cog", async () => {
    const poppler = "pdftotext version 24.02.0\nCopyright 2005-2024 The Poppler Developers - http://poppler.freedesktop.org\nCopyright 1996-2011, 2022 Glyph & Cog, LLC\n";
    const shell = fakeShell(fakeHost(BBOX, { pdftotext: { exitCode: 99, stderr: poppler } }));
    await expect(call(createOcrModule(HOST), shell, ["ocr", "page"], { file: "menu.pdf" })).rejects.toThrow(/^pdftotext failed \(exit code 99\): pdftotext version 24\.02\.0/);
  });

  it("keeps the error of a failed program that has no other program with its name", async () => {
    const shell = fakeShell({ exitCode: 1, stderr: "read_params_file: Can't open Glyph & Cog" });
    await expect(call(createOcrModule(HOST), shell, ["ocr", "image"], { file: "sign.png" })).rejects.toThrow(/^tesseract failed \(exit code 1\): read_params_file/);
  });

  it("gives the standard output of a failed program when its standard error is empty", async () => {
    const shell = fakeShell(fakeHost(BBOX, { pdftotext: { exitCode: 1, stdout: "Syntax Error" } }));
    await expect(call(createOcrModule(HOST), shell, ["ocr", "page"], { file: "menu.pdf" })).rejects.toThrow("pdftotext failed (exit code 1): Syntax Error");
  });

  it("refuses a page number below 1 and a mode that is not known", async () => {
    const shell = fakeShell();
    await expect(call(createOcrModule(HOST), shell, ["ocr", "page"], { file: "menu.pdf", page: 0 })).rejects.toThrow();
    await expect(call(createOcrModule(HOST), shell, ["ocr", "page"], { file: "menu.pdf", mode: "fast" })).rejects.toThrow();
    expect(shell.calls).toHaveLength(0);
  });
});

describe("ocr.pageCount", () => {
  it("gives the number of pages from pdfinfo, with the absolute path of the file", async () => {
    const shell = fakeShell({ stdout: PDFINFO });
    const output = await call<OcrPageCountOutput>(createOcrModule(HOST), shell, ["ocr", "pageCount"], { file: "report.pdf" });
    expect(output).toEqual({ pages: 12 });
    expect(shell.calls).toHaveLength(1);
    expect(shell.calls[0]).toMatchObject({ command: "/opt/pdfinfo", args: [resolve("report.pdf")], timeout: 120_000 });
  });

  it("uses the time limit of the input", async () => {
    const shell = fakeShell({ stdout: "Pages:           1\n" });
    expect(await call<OcrPageCountOutput>(createOcrModule(HOST), shell, ["ocr", "pageCount"], { file: "a.pdf", timeout: 5000 })).toEqual({ pages: 1 });
    expect(shell.calls[0]!.timeout).toBe(5000);
  });

  it("throws the error of pdfinfo for a file that is not a PDF file", async () => {
    const shell = fakeShell({ exitCode: 1, stderr: "Syntax Warning: May not be a PDF file (continuing anyway)\nSyntax Error: Couldn't find trailer dictionary\n" });
    await expect(call(createOcrModule(HOST), shell, ["ocr", "pageCount"], { file: "notes.txt" })).rejects.toThrow(/^pdfinfo failed \(exit code 1\): Syntax Warning: May not be a PDF file/);
  });

  it("throws when the output of pdfinfo has no number of pages", async () => {
    const shell = fakeShell({ stdout: "Title:           A sample report\n" });
    await expect(call(createOcrModule(HOST), shell, ["ocr", "pageCount"], { file: "report.pdf" })).rejects.toThrow("The output of pdfinfo has no Pages line with a whole number");
  });

  it("throws a typed error when the search finds no pdfinfo, and starts nothing", async () => {
    const shell = fakeShell();
    const module = createOcrModule({ env: {}, platform: "linux", exists: () => false });
    await expect(call(module, shell, ["ocr", "pageCount"], { file: "report.pdf" })).rejects.toMatchObject({ code: "OCR_TOOL_MISSING", tool: "pdfinfo" });
    expect(shell.calls).toHaveLength(0);
  });

  it("refuses an input with no file", async () => {
    const shell = fakeShell();
    await expect(call(createOcrModule(HOST), shell, ["ocr", "pageCount"], { file: "" })).rejects.toThrow();
    expect(shell.calls).toHaveLength(0);
  });
});

describe("ocr.page with the defaults of the host", () => {
  it("makes its temporary folder in the temporary folder of the system, and uses each program again", async () => {
    const shell = fakeShell(fakeHost(BBOX_EMPTY));
    const module = createOcrModule({ executables: EXECUTABLES });
    await call(module, shell, ["ocr", "page"], { file: "scan.pdf" });
    await call(module, shell, ["ocr", "page"], { file: "scan.pdf" });
    expect(shell.args(1).at(-1)!.startsWith(join(tmpdir(), "procedures-ocr-"))).toBe(true);
    expect(shell.calls).toHaveLength(6);
  });
});

describe("ocr.image", () => {
  it("reads an image with tesseract, with the boxes in pixels", async () => {
    const shell = fakeShell({ stdout: TSV });
    const output = await call<OcrImageOutput>(createOcrModule(HOST), shell, ["ocr", "image"], { file: "sign.png", dpi: 200 });
    expect(output).toMatchObject({ engine: "tesseract", unit: "px", width: 640, height: 200, text: "Hello world\nTotal 12.50" });
    expect(output.lines[1]!.words[1]).toEqual({ text: "12.50", confidence: 0.72, box: { x: 180, y: 112, w: 110, h: 38 } });
    expect(shell.calls[0]).toMatchObject({ command: "/opt/tesseract", args: [resolve("sign.png"), "stdout", "-l", "eng", "--dpi", "200", "tsv"], timeout: 120_000 });
  });

  it("refuses a language that the engine can read as a flag", async () => {
    const shell = fakeShell({ stdout: TSV });
    await expect(call(createOcrModule(HOST), shell, ["ocr", "image"], { file: "sign.png", language: "--user-words=/x" })).rejects.toThrow();
    expect(shell.calls).toHaveLength(0);
    expect(() => tesseractEngine.argv("/a.png", { language: "-x" })).toThrow(/not a valid language name/);
  });

  it("uses the engine of the host", async () => {
    const engine: OcrEngine = {
      name: "made-up",
      program: { ...tesseractEngine.program, name: "madeup" },
      argv: (image) => ["--image", image],
      parse: () => ({ unit: "px", width: 1, height: 1, text: "", confidence: 0, lines: [] }),
    };
    const shell = fakeShell({ stdout: "" });
    const output = await call<OcrImageOutput>(createOcrModule({ engine, executables: { madeup: "/opt/madeup" } }), shell, ["ocr", "image"], { file: "a.png" });
    expect(output.engine).toBe("made-up");
    expect(shell.calls[0]).toMatchObject({ command: "/opt/madeup", args: ["--image", resolve("a.png")] });
  });

  it("throws a typed error when the program did not start", async () => {
    const shell = fakeShell({ exitCode: 1, stderr: "spawn /opt/tesseract ENOENT" });
    await expect(call(createOcrModule(HOST), shell, ["ocr", "image"], { file: "sign.png" })).rejects.toThrow(
      /^The program tesseract is not on this host\. It did not start: spawn \/opt\/tesseract ENOENT\./,
    );
  });

  it("throws a typed error when the search finds no program, and starts nothing", async () => {
    const shell = fakeShell({ stdout: TSV });
    const module = createOcrModule({ env: { PATH: "/nothing" }, platform: "linux", exists: () => false });
    await expect(call(module, shell, ["ocr", "image"], { file: "sign.png" })).rejects.toThrow(/^The program tesseract is not on this host\. The search examined 1 paths\./);
    expect(shell.calls).toHaveLength(0);
  });
});

describe("the module", () => {
  it("declares the effects, the nested calls and the rule of a root of each procedure", () => {
    const meta = Object.fromEntries(ocrProcedures.map((procedure) => [procedure.path.join("."), procedure.metadata]));
    expect(meta["ocr.page"]).toMatchObject({ effects: { reads: ["fs", "process"], writes: ["fs", "process"] }, calls: ["shell.run"], fsRoot: { paths: ["file"] } });
    expect(meta["ocr.image"]).toMatchObject({ effects: { reads: ["fs", "process"], writes: ["process"] }, calls: ["shell.run"], fsRoot: { paths: ["file"] } });
    expect(meta["ocr.pageCount"]).toMatchObject({ effects: { reads: ["fs", "process"], writes: ["process"] }, calls: ["shell.run"], fsRoot: { paths: ["file"] } });
  });

  it("gives the default module without options, and requires the shell module", () => {
    expect(createOcrModule()).toBe(ocrModule);
    expect(createOcrModule({ engine: undefined })).toBe(ocrModule);
    expect(createOcrModule(HOST)).not.toBe(ocrModule);
    const registry = createRegistry(ocrModule);
    expect(registry.has(["ocr", "page"])).toBe(true);
    expect(registry.has(["shell", "run"])).toBe(true);
  });
});

describe("upright: a page on its side", () => {
  const OSD_90 = "Page number: 0\nOrientation in degrees: 270\nRotate: 90\nOrientation confidence: 2.00\nScript: Latin\nScript confidence: 0.39\n";
  const OSD_0 = "Page number: 0\nOrientation in degrees: 0\nRotate: 0\nOrientation confidence: 11.50\n";

  /** A fake tesseract: the mode 0 gives `osd`, each other mode gives the TSV of an image of 640 by 200 pixels. */
  function tesseract(osd: string): (input: FakeShellInput) => FakeShellResult {
    return (input) => {
      const psm = input.args.indexOf("--psm");
      return { stdout: psm >= 0 && input.args[psm + 1] === "0" ? osd : TSV };
    };
  }

  it("finds the orientation, reads in the mode 1 and gives the boxes of the upright image", async () => {
    const shell = fakeShell(tesseract(OSD_90));
    const output = await call<OcrImageOutput>(createOcrModule(HOST), shell, ["ocr", "image"], { file: "scan.png", upright: true });
    expect(shell.args(0)).toEqual([resolve("scan.png"), "stdout", "--psm", "0"]);
    expect(shell.args(1)).toEqual([resolve("scan.png"), "stdout", "-l", "eng", "--psm", "1", "tsv"]);
    expect(output).toMatchObject({ engine: "tesseract", unit: "px", width: 200, height: 640, text: "Hello world\nTotal 12.50", orientation: { turn: 90, confidence: 2 } });
    // The box 180, 112, 110, 38 of the image of 640 by 200 pixels, after a turn of 90 degrees
    expect(output.lines[1]!.words[1]!.box).toEqual({ x: 50, y: 180, w: 38, h: 110 });
  });

  it("reads an upright page in the mode of the input, with the boxes as the engine gives them", async () => {
    const shell = fakeShell(tesseract(OSD_0));
    const output = await call<OcrImageOutput>(createOcrModule(HOST), shell, ["ocr", "image"], { file: "scan.png", upright: true, psm: 6, dpi: 300 });
    expect(shell.args(0)).toEqual([resolve("scan.png"), "stdout", "--psm", "0", "--dpi", "300"]);
    expect(shell.args(1)).toEqual([resolve("scan.png"), "stdout", "-l", "eng", "--psm", "6", "--dpi", "300", "tsv"]);
    expect(output).toMatchObject({ width: 640, height: 200, orientation: { turn: 0, confidence: 11.5 } });
    expect(output.lines[1]!.words[1]!.box).toEqual({ x: 180, y: 112, w: 110, h: 38 });
  });

  it("keeps the mode of the input for a page on its side", async () => {
    const shell = fakeShell(tesseract(OSD_90));
    await call<OcrImageOutput>(createOcrModule(HOST), shell, ["ocr", "image"], { file: "scan.png", upright: true, psm: 4 });
    expect(shell.args(1)).toContain("4");
    expect(shell.args(1)).not.toContain("1");
  });

  it("starts no orientation step without upright, and gives no orientation", async () => {
    const shell = fakeShell(tesseract(OSD_90));
    const output = await call<OcrImageOutput>(createOcrModule(HOST), shell, ["ocr", "image"], { file: "scan.png" });
    expect(shell.calls).toHaveLength(1);
    expect(output).not.toHaveProperty("orientation");
  });

  it("gives the size of the upright page of a PDF file, from its text layer", async () => {
    const shell = fakeShell((input) => (input.command.endsWith("tesseract") ? tesseract(OSD_90)(input) : fakeHost(BBOX_EMPTY)(input)));
    const output = await call<OcrPageOutput>(createOcrModule(HOST), shell, ["ocr", "page"], { file: "scan.pdf", upright: true });
    expect(shell.calls.map((input) => input.command)).toEqual(["/opt/pdftotext", "/opt/pdftoppm", "/opt/tesseract", "/opt/tesseract"]);
    // The text layer gives a page of 595.276 by 841.89 points: the upright page is on its side
    expect(output).toMatchObject({ source: "ocr", width: 841.89, height: 595.276, orientation: { turn: 90, confidence: 2 } });
    // 300 dots per inch: a pixel is 0.24 points
    expect(output.lines[1]!.words[1]!.box).toEqual({ x: 12, y: 43.2, w: 9.12, h: 26.4 });
    expect(readdirSync(temp)).toEqual([]);
  });

  it("refuses upright with an engine that has no orientation step, and starts nothing", async () => {
    const shell = fakeShell(tesseract(OSD_90));
    const engine: OcrEngine = { ...tesseractEngine, orientation: undefined };
    await expect(call(createOcrModule({ ...HOST, engine }), shell, ["ocr", "image"], { file: "scan.png", upright: true })).rejects.toThrow(
      "The OCR engine tesseract cannot find the orientation of a page",
    );
    expect(shell.calls).toHaveLength(0);
  });
});
