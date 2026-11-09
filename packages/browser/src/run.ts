/**
 * The headless run of a browser that is already installed. The run starts the browser one time with
 * argv, in a new temporary folder with its own profile. Each render of this package (the PDF file,
 * the screenshot) uses this run, and gives only its flags and the check of its file.
 *
 * The browser starts through `runCommand` of `@procedures/shell`, not through a shell. A time limit
 * and the signal of the call stop its process tree.
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

/** The options of each render. */
export interface HeadlessOptions extends FindBrowserOptions {
  /** The path of the output file. The default is a file in a new temporary folder. */
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

/** The result of a render. */
export interface RenderResult {
  /** The absolute path of the output file. */
  readonly path: string;
  /** The size of the output file, in bytes. */
  readonly bytes: number;
  /** The browser program that made the file. */
  readonly browser: string;
}

/** The page of a render: an address, an HTML text or the path of an HTML file. */
export type PageSource = { readonly url: string } | { readonly html: string } | { readonly file: string };

/** One kind of render: its flags, the name of its file and the check of the file. */
export interface HeadlessRender {
  /** The start of the name of the temporary folder, for example `procedures-pdf-`. */
  readonly prefix: string;
  /** The name of the file that the browser writes in the temporary folder, for example `page.pdf`. */
  readonly file: string;
  /** The kind of the file in an error, for example `PDF file`. */
  readonly noun: string;
  /** This function gives the argv of the browser: the flags, the extra flags, then the page. */
  argv(page: string, output: string, profile: string, extra: readonly string[]): string[];
  /** This function tells if the file that the browser wrote is a file of this kind. */
  isValid(path: string): boolean;
}

/** This function gives the first bytes of a file, at most `count` bytes. */
export function readHead(path: string, count: number): Buffer {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(count);
    const read = readSync(fd, head, 0, count, 0);
    return head.subarray(0, read);
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
 * This function starts the browser one time for a render, and gives the path and the size of the
 * file. It throws when it finds no browser, at the time limit and after a cancel. It also throws
 * when the file is missing, empty or not of the kind of the render.
 *
 * An existing output file changes only after the check of the new file. Thus a failed render keeps
 * an old output file.
 */
export async function headlessRender(render: HeadlessRender, source: PageSource, options: HeadlessOptions): Promise<RenderResult> {
  const browser = findBrowser(options);
  if (browser === undefined) {
    throw new Error(`No browser found. Install Microsoft Edge, Google Chrome or Chromium, or set ${BROWSER_ENV} to the browser program.`);
  }

  const work = mkdtempSync(join(tmpdir(), render.prefix));
  const profile = join(work, "profile");
  const htmlFile = join(work, "page.html");
  const output = resolve(options.output ?? join(work, render.file));
  const written = join(work, render.file);
  let made = false;
  try {
    let page: string;
    if ("html" in source) {
      writeFileSync(htmlFile, source.html, "utf8");
      page = pathToFileURL(htmlFile).href;
    } else if ("file" in source) {
      page = pathToFileURL(resolve(source.file)).href;
    } else {
      page = source.url;
    }
    mkdirSync(dirname(output), { recursive: true });

    const run = options.runner ?? runCommand;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const result = await run(browser, {
      args: render.argv(page, written, profile, options.args ?? []),
      timeout,
      signal: options.signal,
      maxOutputBytes: 64 * 1024,
      keep: "tail",
    });
    if (result.error !== undefined) throw new Error(`The browser did not start: ${result.error}`);
    if (result.timedOut === true) throw new Error(`The browser did not finish in ${timeout} ms`);
    if (result.aborted === true) throw new Error("The render was cancelled");

    const bytes = fileSize(written);
    if (bytes === undefined || bytes === 0) {
      const detail = lastLines(result.stderr || result.stdout);
      throw new Error(`The browser made no ${render.noun} (exit code ${result.exitCode})${detail ? `: ${detail}` : ""}`);
    }
    if (!render.isValid(written)) throw new Error(`The file ${output} is not a ${render.noun}`);
    // The temporary folder goes in `finally`, so a copy is enough, also across two drives
    if (written !== output) copyFileSync(written, output);
    made = true;
    return { path: output, bytes, browser };
  } finally {
    // The temporary page and profile go. A default output stays in its folder after a success.
    if (made && options.output === undefined) {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      rmSync(htmlFile, { force: true });
    } else {
      rmSync(work, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}
