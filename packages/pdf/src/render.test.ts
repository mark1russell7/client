import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import type { CommandOptions, CommandResult } from "@procedures/shell/command";
import { isPdfFile, pdfArgs, renderPdf, type CommandRunner } from "./render.js";
import { pdfProcedures } from "./module.js";
import { pdfRender } from "./procedures/pdf/index.js";

const FAKE_PDF = "%PDF-1.7\n% a made-up document for the tests\n%%EOF\n";
const OK: CommandResult = { exitCode: 0, stdout: "", stderr: "", success: true, duration: 1 };

interface Call {
  readonly command: string;
  readonly options: CommandOptions;
  readonly page: string;
}

/** A runner that acts as a browser: it writes `content` to the path of --print-to-pdf. */
function fakeBrowser(content: string | null = FAKE_PDF, result: Partial<CommandResult> = {}): { runner: CommandRunner; calls: Call[] } {
  const calls: Call[] = [];
  const runner: CommandRunner = async (command, options) => {
    const args = options.args ?? [];
    const out = args.find((arg) => arg.startsWith("--print-to-pdf="))!.slice("--print-to-pdf=".length);
    const pageUrl = args.at(-1)!;
    calls.push({ command, options, page: readFileSync(fileURLToPath(pageUrl), "utf8") });
    if (content !== null) writeFileSync(out, content);
    return { ...OK, ...result };
  };
  return { runner, calls };
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "pdf-test-"));
}

describe("pdfArgs", () => {
  it("gives the flags of a headless print, the extra flags, then the page", () => {
    expect(pdfArgs("file:///page.html", "/out/a.pdf", "/tmp/profile", ["--no-sandbox"])).toEqual([
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--user-data-dir=/tmp/profile",
      "--print-to-pdf=/out/a.pdf",
      "--no-sandbox",
      "file:///page.html",
    ]);
  });
});

describe("isPdfFile", () => {
  it("reads the signature of the file", () => {
    const dir = scratch();
    writeFileSync(join(dir, "a.pdf"), FAKE_PDF);
    writeFileSync(join(dir, "b.pdf"), "<html>");
    writeFileSync(join(dir, "c.pdf"), "%P");
    expect(isPdfFile(join(dir, "a.pdf"))).toBe(true);
    expect(isPdfFile(join(dir, "b.pdf"))).toBe(false);
    expect(isPdfFile(join(dir, "c.pdf"))).toBe(false);
  });
});

describe("renderPdf", () => {
  it("writes the HTML text to a temporary page and gives the PDF path and size", async () => {
    const { runner, calls } = fakeBrowser();
    const result = await renderPdf({ html: "<h1>Menu</h1>", executable: "/opt/browser", runner, timeout: 5000 });
    expect(result.browser).toBe("/opt/browser");
    expect(result.bytes).toBe(Buffer.byteLength(FAKE_PDF));
    expect(readFileSync(result.path, "utf8")).toBe(FAKE_PDF);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.command).toBe("/opt/browser");
    expect(calls[0]!.page).toBe("<h1>Menu</h1>");
    expect(calls[0]!.options.timeout).toBe(5000);
    // The temporary page and profile go, the PDF stays
    expect(existsSync(join(dirname(result.path), "page.html"))).toBe(false);
    expect(existsSync(join(dirname(result.path), "profile"))).toBe(false);
  });

  it("prints an HTML file to the output path, and makes its folder", async () => {
    const dir = scratch();
    const page = join(dir, "card.html");
    writeFileSync(page, "<p>Card</p>");
    const output = join(dir, "out", "nested", "card.pdf");
    const { runner, calls } = fakeBrowser();
    const result = await renderPdf({ file: page, output, executable: "/opt/browser", runner, args: ["--no-sandbox"] });
    expect(result.path).toBe(output);
    expect(calls[0]!.page).toBe("<p>Card</p>");
    expect(calls[0]!.options.args).toContain("--no-sandbox");
    expect(calls[0]!.options.timeout).toBe(60_000);
  });

  it("deletes an old output file before the print", async () => {
    const dir = scratch();
    const output = join(dir, "old.pdf");
    writeFileSync(output, FAKE_PDF);
    const { runner } = fakeBrowser(null, { exitCode: 1, success: false, stderr: "first line\nERROR: no print" });
    await expect(renderPdf({ html: "x", output, executable: "/opt/browser", runner })).rejects.toThrow(/made no PDF file \(exit code 1\): first line\nERROR: no print/);
    expect(existsSync(output)).toBe(false);
  });

  it("refuses a file that is not a PDF file", async () => {
    const { runner } = fakeBrowser("<html>not a pdf</html>");
    await expect(renderPdf({ html: "x", executable: "/opt/browser", runner })).rejects.toThrow(/is not a PDF file/);
  });

  it("refuses an empty file", async () => {
    const { runner } = fakeBrowser("");
    await expect(renderPdf({ html: "x", executable: "/opt/browser", runner })).rejects.toThrow(/made no PDF file \(exit code 0\)$/);
  });

  it("reports a browser that did not start, the time limit and a cancel", async () => {
    const started = fakeBrowser(null, { exitCode: 1, success: false, error: "spawn /opt/browser ENOENT" });
    await expect(renderPdf({ html: "x", executable: "/opt/browser", runner: started.runner })).rejects.toThrow(/did not start: spawn \/opt\/browser ENOENT/);
    const slow = fakeBrowser(null, { exitCode: 1, success: false, timedOut: true });
    await expect(renderPdf({ html: "x", executable: "/opt/browser", runner: slow.runner, timeout: 10 })).rejects.toThrow(/did not finish in 10 ms/);
    const cancelled = fakeBrowser(null, { exitCode: 1, success: false, aborted: true });
    await expect(renderPdf({ html: "x", executable: "/opt/browser", runner: cancelled.runner })).rejects.toThrow(/cancelled/);
  });

  it("needs html or file, and not the two", async () => {
    const { runner } = fakeBrowser();
    await expect(renderPdf({ executable: "/opt/browser", runner })).rejects.toThrow(/html or file/);
    await expect(renderPdf({ html: "x", file: "y.html", executable: "/opt/browser", runner })).rejects.toThrow(/html or file/);
  });

  it("tells how to name a browser when it finds none", async () => {
    await expect(renderPdf({ html: "x", env: { PATH: "" }, platform: "linux", exists: () => false })).rejects.toThrow(/No browser found.*PDF_BROWSER/);
  });

  it("gives the signal of the call to the runner", async () => {
    const { runner, calls } = fakeBrowser();
    const controller = new AbortController();
    await pdfRender({ html: "x", executable: "/opt/browser" }, { signal: controller.signal }, runner);
    expect(calls[0]!.options.signal).toBe(controller.signal);
  });
});

describe("pdf.render", () => {
  const registry = new ProcedureRegistry();
  for (const procedure of pdfProcedures) registry.register(procedure);
  const call = (input: unknown): Promise<unknown> =>
    invokePath(["pdf", "render"], input, { registry }).then((output) => outputValue(output, ["pdf", "render"]));

  it("declares its effects", () => {
    expect(pdfProcedures[0]!.metadata?.effects).toEqual({ reads: ["fs", "network", "process"], writes: ["fs", "process"], destructive: true });
  });

  it("refuses an input with html and file", async () => {
    await expect(call({ html: "x", file: "y.html", executable: "/opt/browser" })).rejects.toThrow(/html or file/);
  });

  it("reports a program that is not a browser", async () => {
    // Node refuses the flags of the browser and makes no file
    await expect(call({ html: "<p>x</p>", executable: process.execPath, timeout: 20_000 })).rejects.toThrow(/made no PDF file \(exit code [1-9]/);
  });
});
