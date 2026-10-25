/**
 * HTML to PDF with a headless Chromium browser that is already installed.
 *
 * The browser starts with argv, not through a shell, through `runCommand` of
 * `@procedures/shell`. A time limit and the signal of the call stop its process tree.
 */

import { closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runCommand, type CommandOptions, type CommandResult } from "@procedures/shell/command";
import { BROWSER_ENV, findBrowser, type FindBrowserOptions } from "./browser.js";

/** The default time limit of one render, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 60_000;

/** The function that runs a program. The default is `runCommand` of `@procedures/shell`. */
export type CommandRunner = (command: string, options: CommandOptions) => Promise<CommandResult>;

/** The options of `renderPdf`. Give `html` or `file`, not the two. */
export interface RenderPdfOptions extends FindBrowserOptions {
  /** The HTML text. The function writes it to a temporary file. */
  readonly html?: string | undefined;
  /** The path of an HTML file. */
  readonly file?: string | undefined;
  /** The path of the PDF file. The default is a file in a new temporary folder. */
  readonly output?: string | undefined;
  /** More flags for the browser, after the default flags. */
  readonly args?: readonly string[] | undefined;
  /** The time limit, in milliseconds (default: 60000). */
  readonly timeout?: number | undefined;
  /** When the signal aborts, the browser stops. */
  readonly signal?: AbortSignal | undefined;
  /** The function that runs the browser (default: `runCommand`). The tests give their own. */
  readonly runner?: CommandRunner | undefined;
}

/** The result of `renderPdf`. */
export interface RenderPdfResult {
  /** The absolute path of the PDF file. */
  readonly path: string;
  /** The size of the PDF file, in bytes. */
  readonly bytes: number;
  /** The browser program that made the file. */
  readonly browser: string;
}

/**
 * This function gives the argv of the browser. The argv has the flags of a headless print, the
 * profile folder, the extra flags and the address of the page.
 */
export function pdfArgs(page: string, output: string, profile: string, extra: readonly string[] = []): string[] {
  return [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    // A separate profile keeps the print apart from a browser that the user has open
    `--user-data-dir=${profile}`,
    `--print-to-pdf=${output}`,
    ...extra,
    page,
  ];
}

/** This function tells if a file starts with the signature of a PDF file (`%PDF`). */
export function isPdfFile(path: string): boolean {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(4);
    const read = readSync(fd, head, 0, 4, 0);
    return read === 4 && head.toString("latin1") === "%PDF";
  } finally {
    closeSync(fd);
  }
}

function fileSize(path: string): number | undefined {
  try {
    return statSync(path).size;
  } catch {
    return undefined;
  }
}

function lastLines(text: string, count = 5): string {
  return text.trim().split(/\r?\n/).slice(-count).join("\n");
}

/**
 * This function prints an HTML page to a PDF file with a headless browser. It gives the path and
 * the size of the file. It throws when it finds no browser, at the time limit, and when the file
 * is not a PDF file.
 */
export async function renderPdf(options: RenderPdfOptions): Promise<RenderPdfResult> {
  const hasHtml = options.html !== undefined;
  const hasFile = options.file !== undefined;
  if (hasHtml === hasFile) throw new Error("renderPdf needs html or file, and not the two");
  const browser = findBrowser(options);
  if (browser === undefined) {
    throw new Error(`No browser found. Install Microsoft Edge, Google Chrome or Chromium, or set ${BROWSER_ENV} to the browser program.`);
  }

  const work = mkdtempSync(join(tmpdir(), "procedures-pdf-"));
  const profile = join(work, "profile");
  const output = resolve(options.output ?? join(work, "page.pdf"));
  // The browser prints into the temporary folder. The file replaces the output only after its
  // check, so a failed render keeps an old output file (before, it was deleted: audit pass 2).
  const printed = join(work, "page.pdf");
  let made = false;
  try {
    let page: string;
    if (options.html !== undefined) {
      const htmlFile = join(work, "page.html");
      writeFileSync(htmlFile, options.html, "utf8");
      page = pathToFileURL(htmlFile).href;
    } else {
      page = pathToFileURL(resolve(options.file!)).href;
    }
    mkdirSync(dirname(output), { recursive: true });

    const run = options.runner ?? runCommand;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const result = await run(browser, {
      args: pdfArgs(page, printed, profile, options.args),
      timeout,
      signal: options.signal,
      maxOutputBytes: 64 * 1024,
      keep: "tail",
    });
    if (result.error !== undefined) throw new Error(`The browser did not start: ${result.error}`);
    if (result.timedOut === true) throw new Error(`The browser did not finish in ${timeout} ms`);
    if (result.aborted === true) throw new Error("The render was cancelled");

    const bytes = fileSize(printed);
    if (bytes === undefined || bytes === 0) {
      const detail = lastLines(result.stderr || result.stdout);
      throw new Error(`The browser made no PDF file (exit code ${result.exitCode})${detail ? `: ${detail}` : ""}`);
    }
    if (!isPdfFile(printed)) throw new Error(`The file ${output} is not a PDF file`);
    // The temporary folder goes in `finally`, so a copy is enough, also across two drives
    if (printed !== output) copyFileSync(printed, output);
    made = true;
    return { path: output, bytes, browser };
  } finally {
    // The temporary page and profile go. A default output stays in its folder after a success.
    if (made && options.output === undefined) {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      rmSync(join(work, "page.html"), { force: true });
    } else {
      rmSync(work, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}
