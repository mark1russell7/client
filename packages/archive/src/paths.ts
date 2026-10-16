/**
 * The check of the entries of an archive before an extract ("zip slip", roadmap R46).
 *
 * `planExtract()` examines all the entries before the extract writes a file. A hostile archive
 * thus changes nothing. The rules:
 *
 * 1. A path must be relative and must not have `..`. A drive letter, a UNC path, a NUL character
 *    and (on Windows) a colon are refused too. A backslash counts as a separator.
 * 2. An entry must not go through a symbolic link of the archive: a link `a` and a file `a/b`.
 * 3. A symbolic link must stay in the target. Its target is relative, and the resolution through
 *    the other links of the archive stays in the target folder. The check knows all the links of
 *    the archive first, so the order of the entries does not matter.
 * 4. A path of a link appears only one time in the archive.
 * 5. A hard link names a file that came before it in the archive.
 * 6. A folder of the target that the extract goes through must not be a symbolic link.
 * 7. Without `overwrite`, an existing file at the path of an entry is an error.
 *
 * Rules 2 and 3 compare the paths two times: with the case, and without the case. A file system
 * that ignores the case (Windows, macOS) then gets the same protection as one that does not.
 */

import { lstatSync, type Stats } from "node:fs";
import { join } from "node:path";
import { ArchiveError } from "./errors.js";
import type { ArchiveEntryKind } from "./types.js";

/** One entry of an archive, before the check. */
export interface RawEntry {
  /** The name in the archive. */
  readonly name: string;
  readonly kind: ArchiveEntryKind;
  readonly size: number;
  /** The target of a symbolic link, or the archive path of the file of a hard link. */
  readonly linkTarget?: string | undefined;
  /** The place of the entry in the archive. */
  readonly index?: number | undefined;
}

/** One entry after the check. */
export interface PlannedEntry extends RawEntry {
  /** The parts of the path: no empty part, no `.` and no `..`. */
  readonly parts: readonly string[];
  /** The parts joined with `/`. */
  readonly path: string;
}

/** The options of `planExtract()`. */
export interface PlanOptions {
  readonly overwrite: boolean;
  readonly maxBytes: number;
  readonly maxEntries: number;
}

/** The longest chain of links that a resolution follows. More is a loop. */
const MAX_LINK_STEPS = 40;

const isWindows = process.platform === "win32";

/** True for a path that starts at a root: `/x`, `\x`, `C:x`, `C:\x` or `\\server\share`. */
export function isAbsoluteName(name: string): boolean {
  return /^[/\\]/.test(name) || /^[A-Za-z]:/.test(name);
}

/**
 * This function gives the parts of the path of an entry. It throws `UNSAFE_PATH` for an absolute
 * path, a `..`, a NUL character, and on Windows a colon (an alternate data stream).
 */
export function entryParts(name: string, code: "UNSAFE_PATH" | "UNSAFE_LINK" = "UNSAFE_PATH"): string[] {
  if (name.includes("\0")) throw new ArchiveError(code, `The entry ${JSON.stringify(name)} has a NUL character`, name);
  if (isAbsoluteName(name)) throw new ArchiveError(code, `The entry ${name} has an absolute path`, name);
  const parts = name.split(/[/\\]+/).filter((part) => part !== "" && part !== ".");
  for (const part of parts) {
    if (part === "..") throw new ArchiveError(code, `The entry ${name} has "..": it can go out of the target folder`, name);
    if (isWindows && part.includes(":")) throw new ArchiveError(code, `The entry ${name} has a colon, which Windows reads as a data stream`, name);
  }
  return parts;
}

/** The parts of the target of a symbolic link. `..` stays: the resolution follows it. */
function linkParts(target: string): string[] {
  return target.split(/[/\\]+/).filter((part) => part !== "" && part !== ".");
}

/** The key of a path, with the case or without it. */
function keyOf(parts: readonly string[], fold: boolean): string {
  const key = parts.join("/");
  return fold ? key.normalize("NFC").toLowerCase() : key;
}

/** The status of a path, or undefined when it does not exist. The results stay in a cache. */
function statOf(cache: Map<string, Stats | undefined>, path: string): Stats | undefined {
  if (cache.has(path)) return cache.get(path);
  let stats: Stats | undefined;
  try {
    stats = lstatSync(path);
  } catch {
    stats = undefined;
  }
  cache.set(path, stats);
  return stats;
}

/**
 * The resolution of parts through the links of the archive: the parts of the place, or undefined
 * when the resolution goes out of the root, meets an absolute link, meets a link of the target
 * folder that is not in the archive, or follows too many links.
 */
function resolve(
  parts: readonly string[],
  links: ReadonlyMap<string, string>,
  fold: boolean,
  foreignLink: (parts: readonly string[]) => boolean,
  budget: { steps: number },
): string[] | undefined {
  const place: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      if (place.length === 0) return undefined;
      place.pop();
      continue;
    }
    place.push(part);
    const target = links.get(keyOf(place, fold));
    if (target === undefined) {
      if (foreignLink(place)) return undefined;
      continue;
    }
    if (--budget.steps < 0 || isAbsoluteName(target)) return undefined;
    const resolved = resolve([...place.slice(0, -1), ...linkParts(target)], links, fold, foreignLink, budget);
    if (resolved === undefined) return undefined;
    place.splice(0, place.length, ...resolved);
  }
  return place;
}

/**
 * This function examines the entries of an archive for an extract into `target` (a real path),
 * and gives them with their parts. It throws the first problem. It writes nothing.
 */
export function planExtract(entries: readonly RawEntry[], target: string, options: PlanOptions): PlannedEntry[] {
  if (entries.length > options.maxEntries) {
    throw new ArchiveError("TOO_LARGE", `The archive has ${entries.length} entries, more than the limit of ${options.maxEntries}`);
  }
  let bytes = 0;
  const planned: PlannedEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "other") throw new ArchiveError("UNSUPPORTED_ENTRY", `The entry ${entry.name} is a special file (a device or a FIFO)`, entry.name);
    const parts = entryParts(entry.name);
    if (parts.length === 0) {
      if (entry.kind === "directory") continue;
      throw new ArchiveError("UNSAFE_PATH", `The entry ${JSON.stringify(entry.name)} has no name`, entry.name);
    }
    if (entry.kind === "file") {
      bytes += entry.size;
      if (bytes > options.maxBytes) throw new ArchiveError("TOO_LARGE", `The files of the archive have more than ${options.maxBytes} bytes`, entry.name);
    }
    planned.push({ ...entry, parts, path: parts.join("/") });
  }

  // The links of the archive, with the case and without it
  const links = [new Map<string, string>(), new Map<string, string>()] as const;
  for (const entry of planned) {
    if (entry.kind !== "symlink") continue;
    for (const [index, map] of links.entries()) map.set(keyOf(entry.parts, index === 1), entry.linkTarget ?? "");
  }

  const stats = new Map<string, Stats | undefined>();
  const foreignLink = (parts: readonly string[]): boolean => statOf(stats, join(target, ...parts))?.isSymbolicLink() === true;
  const files = new Set<string>();
  const seenLinks = new Set<string>();

  for (const entry of planned) {
    const keys = [keyOf(entry.parts, false), keyOf(entry.parts, true)];
    // Rule 2: no part before the last is a link of the archive
    for (let length = 1; length < entry.parts.length; length++) {
      const prefix = entry.parts.slice(0, length);
      if (links[0].has(keyOf(prefix, false)) || links[1].has(keyOf(prefix, true))) {
        throw new ArchiveError("UNSAFE_PATH", `The entry ${entry.name} goes through the link ${prefix.join("/")} of the archive`, entry.name);
      }
    }
    // Rule 4: the path of a link appears one time
    const isLinkPath = links[0].has(keys[0]!) || links[1].has(keys[1]!);
    if (isLinkPath && (entry.kind !== "symlink" || seenLinks.has(keys[1]!))) {
      throw new ArchiveError("UNSAFE_LINK", `The path ${entry.name} is a link and another entry of the archive`, entry.name);
    }
    if (entry.kind === "symlink") {
      seenLinks.add(keys[1]!);
      // Rule 3: the target stays in the target folder
      const linkTarget = entry.linkTarget ?? "";
      if (linkTarget === "" || isAbsoluteName(linkTarget) || linkTarget.includes("\0")) {
        throw new ArchiveError("UNSAFE_LINK", `The link ${entry.name} points to ${JSON.stringify(linkTarget)}: a link must point to a relative path`, entry.name);
      }
      for (const fold of [false, true]) {
        const resolved = resolve([...entry.parts.slice(0, -1), ...linkParts(linkTarget)], links[fold ? 1 : 0], fold, foreignLink, { steps: MAX_LINK_STEPS });
        if (resolved === undefined) {
          throw new ArchiveError("UNSAFE_LINK", `The link ${entry.name} points to ${linkTarget}, out of the target folder`, entry.name);
        }
      }
    }
    if (entry.kind === "hardlink") {
      // Rule 5: a hard link names an earlier file of the archive
      const linked = entryParts(entry.linkTarget ?? "", "UNSAFE_LINK");
      if (!files.has(keyOf(linked, true))) {
        throw new ArchiveError("UNSAFE_LINK", `The hard link ${entry.name} names ${entry.linkTarget}, which is not an earlier file of the archive`, entry.name);
      }
    }
    if (entry.kind === "file") files.add(keys[1]!);

    // Rule 6: the folders of the target on the way are folders, not links
    for (let length = 1; length < entry.parts.length; length++) {
      const folder = join(target, ...entry.parts.slice(0, length));
      const found = statOf(stats, folder);
      if (found === undefined) break;
      if (found.isSymbolicLink()) throw new ArchiveError("UNSAFE_PATH", `The folder ${folder} of the target is a link: the entry ${entry.name} can go out through it`, entry.name);
      if (!found.isDirectory()) throw new ArchiveError("EXISTS", `${folder} is a file, and the entry ${entry.name} needs a folder there`, entry.name);
    }
    // Rule 7: an existing path
    const existing = statOf(stats, join(target, ...entry.parts));
    if (existing !== undefined) {
      if (entry.kind === "directory") {
        if (!existing.isDirectory()) throw new ArchiveError("EXISTS", `${join(target, ...entry.parts)} exists and is not a folder`, entry.name);
      } else if (existing.isDirectory()) {
        throw new ArchiveError("EXISTS", `${join(target, ...entry.parts)} is a folder, and the entry ${entry.name} is not`, entry.name);
      } else if (!options.overwrite) {
        throw new ArchiveError("EXISTS", `${join(target, ...entry.parts)} exists: give overwrite: true to replace it`, entry.name);
      }
    }
  }
  return planned;
}
