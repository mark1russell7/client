/**
 * The search for the programs of this package on the host: `tesseract` (the OCR engine), and
 * `pdftotext` and `pdftoppm` of Poppler. The package does not download a program. When the search
 * finds no program, `requireProgram` throws an `OcrToolMissingError`.
 */

import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

/** The environment of the search. */
export type ProgramEnv = Readonly<Record<string, string | undefined>>;

/** The description of a program for the search. */
export interface ProgramSpec {
  /** The name of the program, without `.exe`, for example `tesseract`. */
  readonly name: string;
  /** The environment variables that give the path of the program, in order. */
  readonly env: readonly string[];
  /** The environment variables that give the folder of the program, in order. */
  readonly folderEnv?: readonly string[] | undefined;
  /** This function gives the install paths of the program on an operating system, in order. */
  readonly installed: (platform: NodeJS.Platform, env: ProgramEnv) => readonly string[];
  /** The text that tells how to install the program, for the error. */
  readonly install: string;
}

/** The options of the search. Each one has a default from the host. */
export interface FindProgramOptions {
  /** The environment (default: `process.env`). */
  readonly env?: ProgramEnv | undefined;
  /** The operating system (default: `process.platform`). */
  readonly platform?: NodeJS.Platform | undefined;
  /** The function that tells if a file exists (default: `existsSync`). */
  readonly exists?: ((path: string) => boolean) | undefined;
}

/** The folders of Homebrew on macOS. An app that starts from the Finder does not have them on the `PATH`. */
const HOMEBREW_FOLDERS: readonly string[] = ["/opt/homebrew/bin", "/usr/local/bin"];

function programFiles(env: ProgramEnv): string[] {
  return [env["ProgramFiles"] ?? env["PROGRAMFILES"] ?? "C:\\Program Files", env["ProgramFiles(x86)"] ?? env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"];
}

/** The OCR engine tesseract. The installer for Windows puts it in `Tesseract-OCR`, and not on the `PATH`. */
export const TESSERACT: ProgramSpec = {
  name: "tesseract",
  env: ["TESSERACT_EXE"],
  installed: (platform, env) => {
    if (platform === "win32") {
      const local = env["LOCALAPPDATA"];
      return [
        ...programFiles(env).map((folder) => win32.join(folder, "Tesseract-OCR", "tesseract.exe")),
        ...(local !== undefined ? [win32.join(local, "Programs", "Tesseract-OCR", "tesseract.exe")] : []),
      ];
    }
    return platform === "darwin" ? HOMEBREW_FOLDERS.map((folder) => posix.join(folder, "tesseract")) : [];
  },
  install: "the package tesseract-ocr on Linux, brew install tesseract on macOS, or the Tesseract installer on Windows",
};

function poppler(name: string, env: string): ProgramSpec {
  return {
    name,
    env: [env],
    folderEnv: ["POPPLER_PATH"],
    installed: (platform, environment) => {
      if (platform === "win32") return programFiles(environment).map((folder) => win32.join(folder, "poppler", "Library", "bin", `${name}.exe`));
      return platform === "darwin" ? HOMEBREW_FOLDERS.map((folder) => posix.join(folder, name)) : [];
    },
    install: "the package poppler-utils on Linux, brew install poppler on macOS, or a Poppler build on Windows",
  };
}

/** The program of Poppler that gives the text layer of a PDF page. */
export const PDFTOTEXT: ProgramSpec = poppler("pdftotext", "PDFTOTEXT_EXE");

/** The program of Poppler that makes an image of a PDF page. */
export const PDFTOPPM: ProgramSpec = poppler("pdftoppm", "PDFTOPPM_EXE");

/** The programs of this package. */
export const OCR_PROGRAMS: readonly ProgramSpec[] = [TESSERACT, PDFTOTEXT, PDFTOPPM];

/** The error when a program of this package is not on the host. */
export class OcrToolMissingError extends Error {
  /** The code of the error, for a check without `instanceof`. */
  readonly code = "OCR_TOOL_MISSING" as const;
  /** The name of the program, for example `tesseract`. */
  readonly tool: string;
  /** The paths that the search examined, in order. */
  readonly searched: readonly string[];

  override readonly name: string = "OcrToolMissingError";
  constructor(spec: ProgramSpec, searched: readonly string[], cause?: string) {
    const variables = [...spec.env, ...(spec.folderEnv ?? [])].join(" or ");
    const reason = cause === undefined ? `The search examined ${searched.length} paths.` : `It did not start: ${cause}.`;
    super(`The program ${spec.name} is not on this host. ${reason} Install ${spec.install}, or set ${variables}.`);
    this.tool = spec.name;
    this.searched = searched;
  }
}

/** This function gives the folders of the `PATH`, in order. */
function pathFolders(env: ProgramEnv, windows: boolean): string[] {
  const value = windows ? (env["Path"] ?? env["PATH"]) : env["PATH"];
  if (value === undefined) return [];
  return value.split(windows ? ";" : ":").filter((folder) => folder.length > 0);
}

/**
 * This function gives the paths that the search examines for a program, in order. The order is
 * the folders of the `folderEnv` variables, the install paths, then the folders of the `PATH`.
 */
export function programCandidates(spec: ProgramSpec, platform: NodeJS.Platform, env: ProgramEnv): string[] {
  const windows = platform === "win32";
  const path = windows ? win32 : posix;
  const file = windows ? `${spec.name}.exe` : spec.name;
  const folders = (spec.folderEnv ?? []).map((name) => env[name]).filter((value): value is string => value !== undefined && value.length > 0);
  return [...folders.map((folder) => path.join(folder, file)), ...spec.installed(platform, env), ...pathFolders(env, windows).map((folder) => path.join(folder, file))];
}

/**
 * This function finds a program. The order is `executable`, then the `env` variables of the spec,
 * then `programCandidates`. It gives `undefined` when it finds none. It does not examine the
 * value of `executable` or of an `env` variable.
 */
export function findProgram(spec: ProgramSpec, options: FindProgramOptions & { readonly executable?: string | undefined } = {}): string | undefined {
  if (options.executable !== undefined && options.executable.length > 0) return options.executable;
  const env = options.env ?? process.env;
  for (const name of spec.env) {
    const value = env[name];
    if (value !== undefined && value.length > 0) return value;
  }
  const exists = options.exists ?? existsSync;
  return programCandidates(spec, options.platform ?? process.platform, env).find((candidate) => exists(candidate));
}

/** This function finds a program, as `findProgram` does. It throws an `OcrToolMissingError` when it finds none. */
export function requireProgram(spec: ProgramSpec, options: FindProgramOptions & { readonly executable?: string | undefined } = {}): string {
  const found = findProgram(spec, options);
  if (found !== undefined) return found;
  throw new OcrToolMissingError(spec, programCandidates(spec, options.platform ?? process.platform, options.env ?? process.env));
}
