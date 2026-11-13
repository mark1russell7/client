/**
 * The profiles of the Chromium browsers on the disk: Google Chrome, Microsoft Edge and Chromium.
 * This file finds the folders of the user data of each browser. Then it finds the bookmarks files of
 * each profile in them, with the names of the profiles, and reads a file. The parse is in `bookmarks.ts`.
 * This file uses Node.js, so only the root entry exports it.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, posix, win32 } from "node:path";
import {
  BOOKMARK_FILES,
  MAX_BOOKMARKS_BYTES,
  parseChromeBookmarks,
  profileNames,
  type BookmarkSource,
  type ChromeBookmarks,
  type ParseChromeBookmarksOptions,
} from "./bookmarks.js";

/** The file operations of the search and of the read. A test gives files in memory. */
export interface FileAccess {
  /** This function gives the names in a folder, or no names when the folder does not exist. */
  list(folder: string): Promise<readonly string[]>;
  /** This function gives the size of a file in bytes, or `undefined` when the file does not exist. */
  size(file: string): Promise<number | undefined>;
  /** This function gives the text of a file in UTF-8. */
  read(file: string): Promise<string>;
}

/**
 * The file operations on the disk. `list` gives no names for each error, not only for a missing
 * folder: also for a folder that it cannot read (`EACCES`). `size` gives `undefined` for each error
 * and for a path that is not a file. `read` throws the error of the disk.
 */
export const diskFileAccess: FileAccess = {
  list: async (folder) => {
    try {
      return await readdir(folder);
    } catch {
      return [];
    }
  },
  size: async (file) => {
    try {
      const found = await stat(file);
      return found.isFile() ? found.size : undefined;
    } catch {
      return undefined;
    }
  },
  read: (file) => readFile(file, "utf8"),
};

/**
 * The key of a Chromium browser that keeps its profiles in a folder of user data. These are the
 * browsers that `findBrowser` finds. The key is the first part of the id of a bookmarks file.
 */
export type ProfileBrowser = "chrome" | "edge" | "chromium";

/** The browsers of `browserDataFolders`, in the order of its result. */
export const PROFILE_BROWSERS: readonly ProfileBrowser[] = ["chrome", "edge", "chromium"];

/** A folder of the user data of a browser. Each profile of the browser is a folder in it. */
export interface BrowserDataFolder {
  /** The key of the browser, for example `chrome`. Another key, for example `brave`, is also correct. */
  readonly browser: string;
  /** The path of the folder. */
  readonly folder: string;
}

/** The parts of the path of the user data of each browser, on each platform. */
const DATA_PATHS: Readonly<Record<ProfileBrowser, { readonly windows: readonly string[]; readonly mac: readonly string[]; readonly linux: string }>> = {
  chrome: { windows: ["Google", "Chrome", "User Data"], mac: ["Google", "Chrome"], linux: "google-chrome" },
  edge: { windows: ["Microsoft", "Edge", "User Data"], mac: ["Microsoft Edge"], linux: "microsoft-edge" },
  chromium: { windows: ["Chromium", "User Data"], mac: ["Chromium"], linux: "chromium" },
};

/**
 * This function gives the folders of the user data of the browsers for a platform. Windows uses
 * `LOCALAPPDATA`, macOS uses `~/Library/Application Support`, and Linux uses `XDG_CONFIG_HOME` or `~/.config`.
 * The function reads no file, so a folder in the result can be absent.
 */
export function browserDataFolders(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
  browsers: readonly ProfileBrowser[] = PROFILE_BROWSERS,
): BrowserDataFolder[] {
  if (platform === "win32") {
    const local = env["LOCALAPPDATA"] ?? win32.join(home, "AppData", "Local");
    return browsers.map((browser) => ({ browser, folder: win32.join(local, ...DATA_PATHS[browser].windows) }));
  }
  if (platform === "darwin") {
    const support = posix.join(home, "Library", "Application Support");
    return browsers.map((browser) => ({ browser, folder: posix.join(support, ...DATA_PATHS[browser].mac) }));
  }
  const config = env["XDG_CONFIG_HOME"] ?? posix.join(home, ".config");
  return browsers.map((browser) => ({ browser, folder: posix.join(config, DATA_PATHS[browser].linux) }));
}

/** A profile folder has the name `Default` or `Profile <n>`. The guest and system profiles have no bookmarks. */
const PROFILE = /^(Default|Profile \d+)$/;

/** This function gives the order of two profile folders: `Default` first, then `Profile <n>` by the number. */
function profileOrder(a: string, b: string): number {
  const number = (name: string): number => (name === "Default" ? 0 : Number(name.slice("Profile ".length)));
  return number(a) - number(b);
}

/** A bookmarks file that the search found, with its browser, its profile folder and its path. */
export interface BookmarkFile extends BookmarkSource {
  /** The key of the browser of the profile, for example `chrome` or `edge`. */
  readonly browser: string;
  /** The name of the folder of the profile, for example `Default` or `Profile 2`. */
  readonly profile: string;
  /** The path of the file. */
  readonly path: string;
  /** The size of the file in bytes, at the time of the search. A file over `MAX_BOOKMARKS_BYTES` is not a bookmarks file. */
  readonly size: number;
}

/**
 * This function finds the bookmarks files of the profiles in the folders of the user data, in the
 * order of the folders. In a folder, it gives `Default` first, then `Profile <n>` by the number. The
 * file `Local State` gives the names of the profiles. Without it, a profile has the name of its folder.
 * The id of a file starts with the key of its browser, so the files of two browsers have different ids.
 */
export async function findBookmarkFiles(folders: readonly BrowserDataFolder[], files: FileAccess = diskFileAccess): Promise<BookmarkFile[]> {
  const found: BookmarkFile[] = [];
  for (const { browser, folder } of folders) {
    let names = new Map<string, string>();
    try {
      names = profileNames(JSON.parse(await files.read(join(folder, "Local State"))));
    } catch {
      // A missing or broken file Local State gives the names of the folders
    }
    const profiles = new Set([...names.keys(), ...(await files.list(folder))].filter((name) => PROFILE.test(name)));
    for (const profile of [...profiles].sort(profileOrder)) {
      for (const [file, kind] of Object.entries(BOOKMARK_FILES)) {
        const path = join(folder, profile, file);
        const size = await files.size(path);
        if (size === undefined) continue;
        found.push({ id: `${browser}:${profile}:${file}`, name: names.get(profile) ?? profile, kind, browser, profile, path, size });
      }
    }
  }
  return found;
}

/**
 * This function reads and parses a bookmarks file that `findBookmarkFiles` found. It reads the size
 * again, because the file can change after the search. It refuses a file over `MAX_BOOKMARKS_BYTES`
 * before the read. The default prefix of the keys is the id of the file and a colon, so the keys of
 * two files are different.
 *
 * @throws Error when the file is not there, is too large, is not JSON or has no roots
 */
export async function readBookmarkFile(
  file: Pick<BookmarkFile, "id" | "path">,
  files: FileAccess = diskFileAccess,
  options: ParseChromeBookmarksOptions = {},
): Promise<ChromeBookmarks> {
  const size = await files.size(file.path);
  if (size === undefined) throw new Error(`The file ${file.path} is not there now.`);
  if (size > MAX_BOOKMARKS_BYTES) {
    throw new Error(`The file ${file.path} has ${size} bytes. A bookmarks file has ${MAX_BOOKMARKS_BYTES} bytes at most.`);
  }
  const text = await files.read(file.path);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`The file ${file.path} is not JSON, so it is not a bookmarks file.`, { cause: error });
  }
  return parseChromeBookmarks(value, { prefix: options.prefix ?? `${file.id}:` });
}
