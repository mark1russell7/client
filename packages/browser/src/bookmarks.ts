/**
 * The bookmarks files of Chrome. Edge and Chromium write the same format. This file reads the JSON
 * of a bookmarks file, and gives a tree of folders with their sites. It also reads the names of the
 * profiles from the file `Local State`.
 *
 * This file imports no Node built-in, so a page can use it: the entry `@procedures/browser/bookmarks`.
 * The search for the files on the disk is in `profiles.ts`, on the root entry.
 */

/** The deepest folder that the parser reads. A deeper folder gives a problem, and the parser does not read it. */
export const MAX_BOOKMARK_DEPTH = 100;

/** The largest bookmarks file that a reader accepts, in bytes. A larger file is not a bookmarks file. */
export const MAX_BOOKMARKS_BYTES: number = 64 * 1024 * 1024;

/**
 * The kind of a bookmarks file. `profile` is the file `Bookmarks` of a profile. `account` is the
 * file `AccountBookmarks`: the bookmarks of a Google account with no sync.
 */
export type BookmarkFileKind = "profile" | "account";

/** The bookmarks files of a profile, by the name of the file, with their kinds. */
export const BOOKMARK_FILES: Readonly<Record<string, BookmarkFileKind>> = { Bookmarks: "profile", AccountBookmarks: "account" };

/** A bookmarks file, with no path. A host can give this to a page and keep the path. */
export interface BookmarkSource {
  /** The id of the file. The search gives `<browser>:<profile folder>:<file name>`, for example `chrome:Default:Bookmarks`. */
  readonly id: string;
  /** The name of the profile, as the browser shows it. */
  readonly name: string;
  readonly kind: BookmarkFileKind;
}

/** A bookmark of a web site. */
export interface Bookmark {
  /** The address of the site: an `http` or `https` address with a host. */
  readonly url: string;
  /** The title of the bookmark. A bookmark with an empty title has no title. */
  readonly title?: string;
  /** The ISO 8601 time when the user added the bookmark. */
  readonly added?: string;
  /** The names of the folders from the root to the folder of the bookmark. */
  readonly path: readonly string[];
}

/** A folder of the bookmarks, with its sites and the folders in it. */
export interface BookmarkFolder {
  /**
   * The key of the folder, after the prefix of the parse: its `guid`, else its `id`, else its place in the file. The place is
   * the name of the root, then the index of each child, for example `bookmark_bar/2/0`. Each parse of a file gives the same keys.
   */
  readonly key: string;
  readonly name: string;
  /** The names of the folders from the root to this folder. The last name is the name of this folder. */
  readonly path: readonly string[];
  readonly folders: readonly BookmarkFolder[];
  /** The sites directly in this folder. Each site has the path of this folder. */
  readonly sites: readonly Bookmark[];
  /** The count of the sites in this folder and in each folder in it. */
  readonly total: number;
}

/** A part of a bookmarks file that the parser cannot read. */
export interface BookmarkProblem {
  /** The names of the folders to the part. */
  readonly path: readonly string[];
  readonly message: string;
}

/** The result of the parse of a bookmarks file. */
export interface ChromeBookmarks {
  /** The root folders, for example "Bookmarks bar" and "Other bookmarks". */
  readonly roots: readonly BookmarkFolder[];
  /** The count of the bookmarks that are not web sites, for example `javascript:` or `chrome://` addresses. */
  readonly skipped: number;
  readonly problems: readonly BookmarkProblem[];
}

/** The options of `parseChromeBookmarks`. */
export interface ParseChromeBookmarksOptions {
  /** The text before each key. Give two files of one profile different prefixes, so that their keys are different. */
  readonly prefix?: string | undefined;
}

/** The order of the roots that Chrome writes. The roots with other names come after them, in the order of their code units. */
const ROOT_ORDER = ["bookmark_bar", "other", "synced"];

/** The time from 1601-01-01 (the start of the Chrome times) to 1970-01-01, in milliseconds. */
const WINDOWS_EPOCH_MS = 11_644_473_600_000n;

/**
 * A web address has the scheme `http` or `https`, a host, and no spaces. The test does not use `URL`, so it is the same in each
 * runtime. The first character of the host is one class, and the rest is `\S*`. Thus no two quantifiers agree on the same
 * character, and the time of the test is linear in the length of the address.
 */
const WEB = /^https?:\/\/[^\s/?#]\S*$/i;

/**
 * This function gives the ISO 8601 time of a Chrome time, or `undefined` for no time. A Chrome time
 * is a text of the microseconds from 1601-01-01 UTC. The function uses `BigInt`, because the value
 * is larger than a safe integer.
 */
export function chromeTime(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) return undefined;
  const ms = BigInt(value) / 1000n - WINDOWS_EPOCH_MS;
  // The time 0 means no time. A time before 1990 or after 9999 is not a date of a bookmark.
  if (ms < 631_152_000_000n || ms > 253_402_300_799_999n) return undefined;
  return new Date(Number(ms)).toISOString();
}

interface Node {
  readonly type?: unknown;
  readonly name?: unknown;
  readonly url?: unknown;
  readonly children?: unknown;
  readonly guid?: unknown;
  readonly id?: unknown;
  readonly date_added?: unknown;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This function gives the `guid` of a folder, else its `id`. An empty text or a value of another type is not a key. */
function ownKey(node: Node): string | undefined {
  if (typeof node.guid === "string" && node.guid !== "") return node.guid;
  if (typeof node.id === "string" && node.id !== "") return node.id;
  if (typeof node.id === "number" && Number.isFinite(node.id)) return String(node.id);
  return undefined;
}

function rank(name: string): number {
  const index = ROOT_ORDER.indexOf(name);
  return index === -1 ? ROOT_ORDER.length : index;
}

/**
 * This function reads the JSON value of a Chrome bookmarks file: the file `Bookmarks` or
 * `AccountBookmarks` of a profile. It gives a problem for each part that it cannot read, and it
 * reads the other parts. It keeps only the bookmarks of web sites, and counts the others.
 *
 * @throws Error when the value has no roots, so it is not a bookmarks file
 */
export function parseChromeBookmarks(value: unknown, options: ParseChromeBookmarksOptions = {}): ChromeBookmarks {
  const prefix = options.prefix ?? "";
  if (!isNode(value) || !isNode((value as { roots?: unknown }).roots)) throw new Error("A Chrome bookmarks file has an object roots.");
  const rootNodes = (value as { roots: Record<string, unknown> }).roots;
  const problems: BookmarkProblem[] = [];
  let skipped = 0;

  // The place of a folder is the name of its root, then the index of each child to it. It is unique in a file.
  const folderOf = (node: Node, parent: readonly string[], fallback: string, depth: number, place: string): BookmarkFolder => {
    const name = typeof node.name === "string" && node.name !== "" ? node.name : fallback;
    const path = [...parent, name];
    const own = ownKey(node) ?? place;
    const folders: BookmarkFolder[] = [];
    const sites: Bookmark[] = [];
    let total = 0;
    const children = Array.isArray(node.children) ? (node.children as unknown[]) : [];
    if (node.children !== undefined && !Array.isArray(node.children)) problems.push({ path, message: "The children of a folder must be a list." });
    for (const [index, child] of children.entries()) {
      if (!isNode(child)) {
        problems.push({ path, message: "A bookmark must be an object." });
      } else if (child.type === "url") {
        if (typeof child.url !== "string" || !WEB.test(child.url)) {
          skipped++;
          continue;
        }
        const title = typeof child.name === "string" && child.name.trim() !== "" ? child.name : undefined;
        const added = chromeTime(child.date_added);
        sites.push({ url: child.url, ...(title === undefined ? {} : { title }), ...(added === undefined ? {} : { added }), path });
        total++;
      } else if (child.type === "folder") {
        if (depth >= MAX_BOOKMARK_DEPTH) {
          problems.push({ path, message: `A folder is deeper than ${MAX_BOOKMARK_DEPTH} folders. The parser does not read it.` });
          continue;
        }
        const folder = folderOf(child, path, "Folder", depth + 1, `${place}/${index}`);
        folders.push(folder);
        total += folder.total;
      } else {
        problems.push({ path, message: `A bookmark has the type ${String(child.type)}, not url or folder.` });
      }
    }
    return { key: `${prefix}${own}`, name, path, folders, sites, total };
  };

  // The order of the code units, not of a locale, so each runtime gives the same parse. The names are the keys of one
  // object, so no two names are equal.
  const names = Object.keys(rootNodes).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  const roots: BookmarkFolder[] = [];
  for (const name of names) {
    const node = rootNodes[name];
    // The roots object of an old file also has values that are not folders, for example a sync transaction version
    if (!isNode(node) || node.type !== "folder") continue;
    roots.push(folderOf(node, [], name, 1, name));
  }
  return { roots, skipped, problems };
}

/**
 * This function gives the name of each profile from the JSON of the file `Local State` of a
 * Chromium browser, by the folder of the profile. A value that it cannot read gives no names.
 */
export function profileNames(localState: unknown): Map<string, string> {
  const names = new Map<string, string>();
  const cache = (localState as { profile?: { info_cache?: unknown } } | null)?.profile?.info_cache;
  if (typeof cache !== "object" || cache === null) return names;
  for (const [folder, info] of Object.entries(cache)) {
    const name = (info as { name?: unknown } | null)?.name;
    if (typeof name === "string" && name.trim() !== "") names.set(folder, name);
  }
  return names;
}
