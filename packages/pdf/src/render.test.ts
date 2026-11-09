import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import type { CommandOptions, CommandResult } from "@procedures/shell/command";
import type { CommandRunner } from "@procedures/browser";
import { pdfProcedures } from "./module.js";
import { pdfRender } from "./procedures/pdf/index.js";

// The tests of renderPdf are in @procedures/browser. These tests examine the procedure pdf.render.

const FAKE_PDF = "%PDF-1.7\n% a made-up document for the tests\n%%EOF\n";
const OK: CommandResult = { exitCode: 0, stdout: "", stderr: "", success: true, duration: 1 };

interface Call {
  readonly command: string;
  readonly options: CommandOptions;
  readonly page: string;
}

/** A runner that acts as a browser: it writes a PDF file to the path of --print-to-pdf. */
function fakeBrowser(): { runner: CommandRunner; calls: Call[] } {
  const calls: Call[] = [];
  const runner: CommandRunner = async (command, options) => {
    const args = options.args ?? [];
    const out = args.find((arg) => arg.startsWith("--print-to-pdf="))!.slice("--print-to-pdf=".length);
    calls.push({ command, options, page: readFileSync(fileURLToPath(args.at(-1)!), "utf8") });
    writeFileSync(out, FAKE_PDF);
    return OK;
  };
  return { runner, calls };
}

describe("pdfRender", () => {
  it("gives the input and the signal of the call to renderPdf", async () => {
    const { runner, calls } = fakeBrowser();
    const controller = new AbortController();
    const result = await pdfRender({ html: "<h1>Menu</h1>", executable: "/opt/browser", timeout: 5000 }, { signal: controller.signal }, runner);
    expect(result).toEqual({ path: result.path, bytes: Buffer.byteLength(FAKE_PDF), browser: "/opt/browser" });
    expect(calls[0]!.page).toBe("<h1>Menu</h1>");
    expect(calls[0]!.options.signal).toBe(controller.signal);
    expect(calls[0]!.options.timeout).toBe(5000);
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
