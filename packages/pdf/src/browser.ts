/**
 * Find a Chromium browser that is already installed: Microsoft Edge, Google Chrome or Chromium.
 * The package does not download a browser.
 */

import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

/** The environment variable that names the browser program. It comes before the search. */
export const BROWSER_ENV = "PDF_BROWSER";

/** The second environment variable for the browser program. Other tools use this name too. */
export const CHROME_PATH_ENV = "CHROME_PATH";

/** The program names that the search looks for on the `PATH`, in order. */
export const BROWSER_NAMES: readonly string[] = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "microsoft-edge",
  "microsoft-edge-stable",
];

/** The program names on the `PATH` of Windows, in order. */
export const WINDOWS_BROWSER_NAMES: readonly string[] = ["msedge.exe", "chrome.exe"];

/** The options of `findBrowser`. Each one has a default from the host. */
export interface FindBrowserOptions {
  /** The browser program. When it is set, the search does not occur. */
  readonly executable?: string | undefined;
  /** The environment (default: `process.env`). */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** The operating system (default: `process.platform`). */
  readonly platform?: NodeJS.Platform | undefined;
  /** The function that tells if a file exists (default: `existsSync`). */
  readonly exists?: ((path: string) => boolean) | undefined;
}

/** This function gives the folders of the `PATH`, in order. */
function pathFolders(env: Readonly<Record<string, string | undefined>>, windows: boolean): string[] {
  const value = windows ? (env["Path"] ?? env["PATH"]) : env["PATH"];
  if (value === undefined) return [];
  return value.split(windows ? ";" : ":").filter((folder) => folder.length > 0);
}

/**
 * This function gives the paths that the search examines on an operating system, in order. The
 * install folders come first, then the folders of the `PATH`.
 */
export function browserCandidates(platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>): string[] {
  if (platform === "win32") {
    const programFiles = env["ProgramFiles"] ?? env["PROGRAMFILES"] ?? "C:\\Program Files";
    const programFilesX86 = env["ProgramFiles(x86)"] ?? env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    const localAppData = env["LOCALAPPDATA"];
    const installed = [
      win32.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      win32.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      win32.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      win32.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      ...(localAppData !== undefined
        ? [win32.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"), win32.join(localAppData, "Chromium", "Application", "chrome.exe")]
        : []),
    ];
    const onPath = pathFolders(env, true).flatMap((folder) => WINDOWS_BROWSER_NAMES.map((name) => win32.join(folder, name)));
    return [...installed, ...onPath];
  }
  const installed: string[] = [];
  if (platform === "darwin") {
    const bundles = [
      "Google Chrome.app/Contents/MacOS/Google Chrome",
      "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "Chromium.app/Contents/MacOS/Chromium",
    ];
    const home = env["HOME"];
    installed.push(...bundles.map((bundle) => posix.join("/Applications", bundle)));
    if (home !== undefined) installed.push(...bundles.map((bundle) => posix.join(home, "Applications", bundle)));
  }
  const onPath = pathFolders(env, false).flatMap((folder) => BROWSER_NAMES.map((name) => posix.join(folder, name)));
  return [...installed, ...onPath];
}

/**
 * This function finds the browser program. The order is `executable`, then `PDF_BROWSER`, then
 * `CHROME_PATH`, then the install folders and the `PATH`. It gives `undefined` when it finds none.
 */
export function findBrowser(options: FindBrowserOptions = {}): string | undefined {
  if (options.executable !== undefined && options.executable.length > 0) return options.executable;
  const env = options.env ?? process.env;
  for (const name of [BROWSER_ENV, CHROME_PATH_ENV]) {
    const value = env[name];
    if (value !== undefined && value.length > 0) return value;
  }
  const exists = options.exists ?? existsSync;
  return browserCandidates(options.platform ?? process.platform, env).find((candidate) => exists(candidate));
}
