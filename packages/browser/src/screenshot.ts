/**
 * A screenshot of a page with a headless Chromium browser that is already installed. The render
 * uses the headless run of `run.ts`. The browser loads the page in a window of the given size, and
 * writes a PNG, JPEG or WebP picture of the window.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { headlessRender, readHead, type HeadlessOptions, type HeadlessRender, type PageSource, type RenderResult } from "./run.js";

/** The formats of a screenshot. The browser chooses the format from the extension of the file. */
export type ScreenshotFormat = "png" | "jpeg" | "webp";

/** The size of the window of a screenshot, in CSS pixels. */
export interface ScreenshotSize {
  readonly width: number;
  readonly height: number;
}

/** The default size of the window: a common size of a desktop screen. */
export const DEFAULT_SCREENSHOT_SIZE: ScreenshotSize = { width: 1280, height: 800 };

/** The largest side of the window, in CSS pixels. */
export const MAX_SCREENSHOT_SIDE = 16_384;

/** The extension of the temporary file of each format. */
export const SCREENSHOT_EXTENSIONS: Readonly<Record<ScreenshotFormat, string>> = { png: ".png", jpeg: ".jpg", webp: ".webp" };

/** The format of each extension of an output file. */
const FORMAT_OF_EXTENSION: Readonly<Record<string, ScreenshotFormat>> = { ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp" };

/** The schemes of an address that the browser can load. */
const SCHEMES: ReadonlySet<string> = new Set(["http:", "https:", "file:"]);

/** The options of `renderScreenshot`. Give one of `url`, `html` and `file`. */
export interface RenderScreenshotOptions extends HeadlessOptions {
  /** The address of the page: `http`, `https` or `file`. */
  readonly url?: string | undefined;
  /** The HTML text. The function writes it to a temporary file. */
  readonly html?: string | undefined;
  /** The path of an HTML file. */
  readonly file?: string | undefined;
  /** The format. The default is the format of the extension of `output`, else `png`. */
  readonly format?: ScreenshotFormat | undefined;
  /** The size of the window (default: 1280 by 800). */
  readonly size?: ScreenshotSize | undefined;
  /**
   * The virtual time that the scripts and the timers of the page get before the picture, in
   * milliseconds. Without it, the picture follows the load event.
   */
  readonly budget?: number | undefined;
}

/** The result of `renderScreenshot`: the path and the size of the picture, the browser program and the format. */
export interface RenderScreenshotResult extends RenderResult {
  readonly format: ScreenshotFormat;
}

/**
 * This function gives the format of a screenshot from the option `format` and the extension of
 * the output file. It throws when the extension is not of a format, or when the two disagree.
 */
export function screenshotFormatOf(output?: string, format?: ScreenshotFormat): ScreenshotFormat {
  if (output === undefined) return format ?? "png";
  const extension = extname(output).toLowerCase();
  const fromFile = FORMAT_OF_EXTENSION[extension];
  if (fromFile === undefined) throw new Error(`The output of a screenshot ends with .png, .jpg, .jpeg or .webp, not "${extension}"`);
  if (format !== undefined && format !== fromFile) throw new Error(`The output ${output} is a ${fromFile} file, and the format is ${format}`);
  return fromFile;
}

/**
 * This function gives the argv of the browser. The argv has the flags of a headless screenshot,
 * the profile folder, the window size and the time budget. The extra flags and the page follow.
 */
export function screenshotArgs(page: string, output: string, profile: string, size: ScreenshotSize, budget?: number, extra: readonly string[] = []): string[] {
  return [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--mute-audio",
    "--no-first-run",
    // A separate profile keeps the screenshot apart from a browser that the user has open
    `--user-data-dir=${profile}`,
    `--window-size=${size.width},${size.height}`,
    ...(budget !== undefined ? [`--virtual-time-budget=${budget}`] : []),
    `--screenshot=${output}`,
    ...extra,
    page,
  ];
}

/** This function tells if a file starts with the signature of a picture of the format. */
export function isImageFile(path: string, format: ScreenshotFormat): boolean {
  const head = readHead(path, 12);
  if (format === "png") return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (format === "jpeg") return head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP";
}

const isSide = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_SCREENSHOT_SIDE;

/** This function gives the page of the options, and throws when they give not exactly one page. */
function pageOf({ url, html, file }: RenderScreenshotOptions): PageSource {
  const count = [url, html, file].filter((each) => each !== undefined).length;
  if (count !== 1) throw new Error("renderScreenshot needs one of url, html and file");
  if (url === undefined) return html !== undefined ? { html } : { file: file! };
  let scheme: string;
  try {
    scheme = new URL(url).protocol;
  } catch {
    scheme = "";
  }
  // An address with no scheme, for example "--flag", never reaches the argv of the browser
  if (!SCHEMES.has(scheme)) throw new Error(`renderScreenshot needs an http, https or file address, not "${url}"`);
  return { url };
}

/**
 * This function loads a page in a headless browser, and writes a picture of the window. It gives
 * the path and the size of the file and its format. It throws when it finds no browser, at the time
 * limit, and when the file is not a picture of the format.
 *
 * The page can load each address that it names. Give an address that you trust, or a page of your
 * own.
 */
export async function renderScreenshot(options: RenderScreenshotOptions): Promise<RenderScreenshotResult> {
  const source = pageOf(options);
  const format = screenshotFormatOf(options.output, options.format);
  const size = options.size ?? DEFAULT_SCREENSHOT_SIZE;
  if (!isSide(size.width) || !isSide(size.height)) throw new Error(`The width and the height of a screenshot are integers from 1 to ${MAX_SCREENSHOT_SIDE}`);
  const { budget } = options;
  if (budget !== undefined && !(Number.isInteger(budget) && budget > 0)) throw new Error("The budget of a screenshot is a positive integer of milliseconds");
  const render: HeadlessRender = {
    prefix: "procedures-screenshot-",
    file: `page${SCREENSHOT_EXTENSIONS[format]}`,
    noun: `${format.toUpperCase()} file`,
    argv: (page, output, profile, extra) => screenshotArgs(page, output, profile, size, budget, extra),
    isValid: (path) => isImageFile(path, format),
  };
  return { ...(await headlessRender(render, source, options)), format };
}

/** The options of `renderScreenshotBytes`: the options of `renderScreenshot`, with no `output`. */
export interface RenderScreenshotBytesOptions extends Omit<RenderScreenshotOptions, "output"> {
  /** The folder that gets the temporary folder of the picture. The default is the temporary folder of the system. */
  readonly folder?: string | undefined;
}

/** The result of `renderScreenshotBytes`: the picture, its format and the browser program. */
export interface RenderScreenshotBytesResult {
  /** The bytes of the picture. In Node.js, the value is a `Buffer`. */
  readonly data: Uint8Array;
  readonly format: ScreenshotFormat;
  /** The browser program that made the picture. */
  readonly browser: string;
}

/**
 * This function loads a page in a headless browser, and gives the picture of the window as bytes.
 * It has the options and the errors of `renderScreenshot`, with no `output`.
 *
 * The function writes the picture to a new temporary folder, and reads it. Then it removes the
 * folder, also after an error. A folder that the system does not let it remove stays, and gives no error.
 */
export async function renderScreenshotBytes(options: RenderScreenshotBytesOptions): Promise<RenderScreenshotBytesResult> {
  const { folder, ...rest } = options;
  const format = rest.format ?? "png";
  const work = mkdtempSync(join(folder ?? tmpdir(), "procedures-screenshot-bytes-"));
  try {
    const { path, browser } = await renderScreenshot({ ...rest, format, output: join(work, `picture${SCREENSHOT_EXTENSIONS[format]}`) });
    return { data: readFileSync(path), format, browser };
  } finally {
    try {
      // On Windows, a virus scanner can hold the file for a short time, so the removal tries again
      rmSync(work, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // A temporary folder that stays is not an error of the render, and must not hide its error
    }
  }
}
