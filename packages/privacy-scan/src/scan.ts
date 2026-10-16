/**
 * The scan for private data in text: email addresses, phone numbers, coordinate pairs and the
 * terms of a list that the caller gives. Use it before a text or a file goes public.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

/** The kinds of private data that the scan finds. */
export type FindingKind = "term" | "email" | "phone" | "coordinate";

/** All the kinds, in the order of the findings on one position. */
export const FINDING_KINDS: readonly FindingKind[] = ["term", "email", "phone", "coordinate"];

/** A place in a text that holds private data. */
export interface Finding {
  /** The kind of the data. */
  readonly kind: FindingKind;
  /** The line of the match. The first line is 1. */
  readonly line: number;
  /** The position of the first character of the match in its line. The first position is 1. */
  readonly column: number;
  /** The matched text. With the option `mask`, only its first character stays. */
  readonly match: string;
}

/** A finding in a file. */
export interface FileFinding extends Finding {
  /** The path of the file. */
  readonly file: string;
}

/** The options of the scan. */
export interface ScanOptions {
  /** The private terms: names, places, accounts. The match ignores case and finds only whole words. */
  readonly terms?: readonly string[] | undefined;
  /** The values that are not private. The scan does not report them, for each kind. The match ignores case. */
  readonly allow?: readonly string[] | undefined;
  /** The kinds to find (default: all). */
  readonly kinds?: readonly FindingKind[] | undefined;
  /** True: each match shows only its first character, and a `*` for each other character. */
  readonly mask?: boolean | undefined;
}

/** The result of `scanFiles`. */
export interface FileScan {
  /** The findings, file by file. */
  readonly findings: FileFinding[];
  /** The number of text files that the scan examined. */
  readonly files: number;
  /** The binary files, which the scan does not examine. */
  readonly skipped: string[];
}

/** An email address. Use it with `matchAll`, or make a copy: the `g` flag keeps a state. */
export const EMAIL_PATTERN: RegExp = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** A phone number: `+` and 10 to 15 digits, or the North American form `(555) 555-0100`. */
export const PHONE_PATTERN: RegExp = /\+\d{10,15}\b|\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g;

/** A pair of coordinates with 4 decimals or more: `12.3456, -65.4321`. */
export const COORDINATE_PATTERN: RegExp = /-?\b\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g;

/** An address of a domain for examples and tests (RFC 2606) is not private. */
const EXAMPLE_EMAIL = /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|test|invalid|localhost)$/i;

/** The folders that the scan of a folder does not enter. */
const SKIPPED_FOLDERS = new Set(["node_modules", ".git", "dist", "coverage", ".turbo"]);

/** The scan reads the first bytes of a file to find a binary file: a text file has no NUL byte. */
const BINARY_PROBE_BYTES = 8192;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * This function makes the pattern of a term. The match ignores case. A term that starts or ends
 * with a letter or a digit matches only when no letter or digit is next to it.
 */
function termPattern(term: string): RegExp {
  const before = /^[A-Za-z0-9]/.test(term) ? "(?<![A-Za-z0-9])" : "";
  const after = /[A-Za-z0-9]$/.test(term) ? "(?![A-Za-z0-9])" : "";
  return new RegExp(`${before}${escapeRegExp(term)}${after}`, "gi");
}

/** This function hides a match: it keeps the first character and puts a `*` for each other character. */
export function maskMatch(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= 1) return "*".repeat(characters.length);
  return `${characters[0]}${"*".repeat(characters.length - 1)}`;
}

interface Rule {
  readonly kind: FindingKind;
  readonly pattern: RegExp;
  readonly keep?: (match: string) => boolean;
  /**
   * A term in upper case and in lower case. A line that contains neither cannot match the term,
   * so the scan does not start its pattern. With hundreds of terms, this makes the scan fast.
   */
  readonly cheap?: { readonly upper: string; readonly lower: string };
}

/** This function makes the scanner of the options. The scanner of a text gives its findings. */
function createScanner(options: ScanOptions): (text: string) => Finding[] {
  const allowed = new Set((options.allow ?? []).map((value) => value.trim().toLowerCase()));
  const kinds = new Set(options.kinds ?? FINDING_KINDS);
  const rules: Rule[] = [];
  if (kinds.has("term")) {
    const seen = new Set<string>();
    for (const raw of options.terms ?? []) {
      const term = raw.trim();
      const key = term.toLowerCase();
      if (term.length === 0 || seen.has(key) || allowed.has(key)) continue;
      seen.add(key);
      rules.push({ kind: "term", pattern: termPattern(term), cheap: { upper: term.toUpperCase(), lower: key } });
    }
  }
  if (kinds.has("email")) rules.push({ kind: "email", pattern: EMAIL_PATTERN, keep: (match) => !EXAMPLE_EMAIL.test(match) });
  if (kinds.has("phone")) rules.push({ kind: "phone", pattern: PHONE_PATTERN });
  if (kinds.has("coordinate")) rules.push({ kind: "coordinate", pattern: COORDINATE_PATTERN });
  const order = (kind: FindingKind): number => FINDING_KINDS.indexOf(kind);

  return (text: string): Finding[] => {
    const findings: Finding[] = [];
    text.split(/\r?\n/).forEach((content, index) => {
      const upper = content.toUpperCase();
      const lower = content.toLowerCase();
      for (const rule of rules) {
        if (rule.cheap !== undefined && !upper.includes(rule.cheap.upper) && !lower.includes(rule.cheap.lower)) continue;
        for (const match of content.matchAll(rule.pattern)) {
          const value = match[0];
          if (allowed.has(value.toLowerCase()) || (rule.keep !== undefined && !rule.keep(value))) continue;
          findings.push({ kind: rule.kind, line: index + 1, column: match.index + 1, match: options.mask === true ? maskMatch(value) : value });
        }
      }
    });
    return findings.sort((a, b) => a.line - b.line || a.column - b.column || order(a.kind) - order(b.kind));
  };
}

/**
 * This function finds the private data in a text: the terms of the list, email addresses that
 * are not examples, phone numbers and coordinate pairs. The findings are in text order.
 */
export function scanText(text: string, options: ScanOptions = {}): Finding[] {
  return createScanner(options)(text);
}

/** This function gives the files of a folder and of its subfolders, in name order. It does not follow links. */
async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIPPED_FOLDERS.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/**
 * This function scans files for private data. A folder in `paths` gives all its files, without
 * `node_modules`, `.git`, `dist`, `coverage` and links. A missing path is an error.
 */
export async function scanFiles(paths: readonly string[], options: ScanOptions = {}): Promise<FileScan> {
  const scan = createScanner(options);
  const files: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const list = (await stat(path)).isDirectory() ? await filesIn(path) : [path];
    for (const file of list) {
      const key = resolve(file);
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(file);
    }
  }
  const findings: FileFinding[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const buffer = await readFile(file);
    if (buffer.subarray(0, BINARY_PROBE_BYTES).includes(0)) {
      skipped.push(file);
      continue;
    }
    // A byte order mark is not a character of the first line
    const text = buffer.toString("utf8").replace(/^﻿/, "");
    for (const finding of scan(text)) findings.push({ file, ...finding });
  }
  return { findings, files: files.length - skipped.length, skipped };
}

/**
 * This function reads a list file: one entry on each line. A line that starts with `#` is a
 * comment. With `optional`, a missing file gives an empty list.
 */
export async function readTermList(file: string, options: { readonly optional?: boolean | undefined } = {}): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (options.optional === true && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
