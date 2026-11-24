/**
 * The search for the programs on the host, with a made-up environment and file system.
 */

import { describe, expect, it } from "vitest";
import { findProgram, OCR_PROGRAMS, OcrToolMissingError, PDFTOPPM, PDFTOTEXT, programCandidates, requireProgram, TESSERACT } from "./programs.js";

const none = (): boolean => false;
const only =
  (path: string) =>
  (candidate: string): boolean =>
    candidate === path;

describe("findProgram", () => {
  it("gives the executable of the host first, then the environment variable", () => {
    expect(findProgram(TESSERACT, { executable: "/opt/t", env: { TESSERACT_EXE: "/env/t" }, exists: none })).toBe("/opt/t");
    expect(findProgram(TESSERACT, { executable: "", env: { TESSERACT_EXE: "/env/t" }, exists: none })).toBe("/env/t");
    expect(findProgram(PDFTOTEXT, { env: { PDFTOTEXT_EXE: "/env/pdftotext" }, exists: none })).toBe("/env/pdftotext");
  });

  it("finds tesseract in the install folder of Windows", () => {
    const env = { ProgramFiles: "D:\\Apps", LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" };
    expect(findProgram(TESSERACT, { env, platform: "win32", exists: only("D:\\Apps\\Tesseract-OCR\\tesseract.exe") })).toBe("D:\\Apps\\Tesseract-OCR\\tesseract.exe");
    expect(findProgram(TESSERACT, { env, platform: "win32", exists: only("C:\\Users\\a\\AppData\\Local\\Programs\\Tesseract-OCR\\tesseract.exe") })).toBe(
      "C:\\Users\\a\\AppData\\Local\\Programs\\Tesseract-OCR\\tesseract.exe",
    );
  });

  it("finds a program on the PATH, with .exe on Windows", () => {
    expect(findProgram(TESSERACT, { env: { PATH: "/usr/bin:/bin" }, platform: "linux", exists: only("/bin/tesseract") })).toBe("/bin/tesseract");
    expect(findProgram(PDFTOPPM, { env: { Path: "C:\\tools;;C:\\bin" }, platform: "win32", exists: only("C:\\bin\\pdftoppm.exe") })).toBe("C:\\bin\\pdftoppm.exe");
  });

  it("finds a program of Poppler in the folder of POPPLER_PATH first", () => {
    const env = { POPPLER_PATH: "/opt/poppler/bin", PATH: "/usr/bin" };
    expect(programCandidates(PDFTOTEXT, "linux", env)).toEqual(["/opt/poppler/bin/pdftotext", "/usr/bin/pdftotext"]);
    expect(findProgram(PDFTOTEXT, { env, platform: "linux", exists: () => true })).toBe("/opt/poppler/bin/pdftotext");
  });

  it("examines the folders of Homebrew on macOS", () => {
    expect(programCandidates(TESSERACT, "darwin", {})).toEqual(["/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract"]);
    expect(programCandidates(PDFTOPPM, "darwin", {})).toEqual(["/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"]);
  });

  it("examines the default install folders of Windows when the environment does not name them", () => {
    expect(programCandidates(TESSERACT, "win32", {})).toEqual(["C:\\Program Files\\Tesseract-OCR\\tesseract.exe", "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe"]);
    expect(programCandidates(PDFTOTEXT, "win32", { PROGRAMFILES: "E:\\P", "PROGRAMFILES(X86)": "E:\\Q" })).toEqual([
      "E:\\P\\poppler\\Library\\bin\\pdftotext.exe",
      "E:\\Q\\poppler\\Library\\bin\\pdftotext.exe",
    ]);
  });

  it("gives undefined when it finds no program, and reads process.env without an env", () => {
    expect(findProgram(TESSERACT, { env: {}, platform: "linux", exists: none })).toBeUndefined();
    expect(findProgram(TESSERACT, { exists: none, platform: "linux" })).toBe(process.env["TESSERACT_EXE"] || undefined);
  });

  it("knows the three programs of the package", () => {
    expect(OCR_PROGRAMS.map((spec) => spec.name)).toEqual(["tesseract", "pdftotext", "pdftoppm"]);
  });
});

describe("requireProgram", () => {
  it("gives the program that the search finds", () => {
    expect(requireProgram(TESSERACT, { env: { TESSERACT_EXE: "/env/t" } })).toBe("/env/t");
  });

  it("throws a typed error with the paths that the search examined", () => {
    let error: unknown;
    try {
      requireProgram(PDFTOTEXT, { env: { PATH: "/usr/bin" }, platform: "linux", exists: none });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(OcrToolMissingError);
    const missing = error as OcrToolMissingError;
    expect(missing.code).toBe("OCR_TOOL_MISSING");
    expect(missing.name).toBe("OcrToolMissingError");
    expect(missing.tool).toBe("pdftotext");
    expect(missing.searched).toEqual(["/usr/bin/pdftotext"]);
    expect(missing.message).toBe(
      "The program pdftotext is not on this host. The search examined 1 paths. Install the package poppler-utils on Linux, brew install poppler on macOS, or a Poppler build on Windows, or set PDFTOTEXT_EXE or POPPLER_PATH.",
    );
  });

  it("examines the files of the host without an exists function", () => {
    expect(findProgram(TESSERACT, { env: {}, platform: "linux" })).toBeUndefined();
  });

  it("reads the environment and the operating system of the process without options", () => {
    expect(() => requireProgram(PDFTOPPM, { exists: none })).toThrow(OcrToolMissingError);
  });

  it("tells the start error when a program did not start", () => {
    expect(new OcrToolMissingError(TESSERACT, ["/opt/t"], "spawn /opt/t ENOENT").message).toMatch(/^The program tesseract is not on this host\. It did not start: spawn \/opt\/t ENOENT\. .* or set TESSERACT_EXE\.$/);
  });
});
