/**
 * The profiles of Chrome on the disk. This file finds the folder of the user data of Chrome. Then
 * it finds the bookmarks files of each profile in it, with the names of the profiles. The parse of
 * a file is in `bookmarks.ts`. This file uses Node.js, so only the root entry exports it.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { BOOKMARK_FILES, profileNames, type BookmarkSource } from "./bookmarks.js";

/** The file operations of the search. A test gives files in memory. */
export interface FileAccess {
  /** This function gives the names in a folder, or no names when the folder does not exist. */
  list(folder: string): Promise<readonly string[]>;
  /** This function gives the size of a file in bytes, or `undefined` when the file does not exist. */
  size(file: string): Promise<number | undefined>;
  /** This function gives the text of a file in UTF-8. */
  read(file: string): Promise<string>;
}

/** The file operations on the disk. */
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
 * This function gives the folders of the user data of Google Chrome for a platform. Each profile of
 * Chrome is a folder in one of them. The function reads no file.
 */
export function chromeDataFolders(platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>, home: string): string[] {
  if (platform === "win32") {
    const local = env["LOCALAPPDATA"] ?? join(home, "AppData", "Local");
    return [join(local, "Google", "Chrome", "User Data")];
  }
  if (platform === "darwin") return [join(home, "Library", "Application Support", "Google", "Chrome")];
  return [join(env["XDG_CONFIG_HOME"] ?? join(home, ".config"), "google-chrome")];
}

/** A profile folder of Chrome has the name `Default` or `Profile <n>`. The guest and system profiles have no bookmarks. */
const PROFILE = /^(Default|Profile \d+)$/;

/** This function gives the order of two profile folders: `Default` first, then `Profile <n>` by the number. */
function profileOrder(a: string, b: string): number {
  const number = (name: string): number => (name === "Default" ? 0 : Number(name.slice("Profile ".length)));
  return number(a) - number(b);
}

/** A bookmarks file that the search found, with its profile folder and its path. */
export interface BookmarkFile extends BookmarkSource {
  /** The name of the folder of the profile, for example `Default` or `Profile 2`. */
  readonly profile: string;
  /** The path of the file. */
  readonly path: string;
}

/**
 * This function finds the bookmarks files of the Chrome profiles in the folders of the user data.
 * It gives `Default` first, then `Profile <n>` by the number. The file `Local State` gives the
 * names of the profiles. Without it, a profile has the name of its folder.
 */
export async function findBookmarkFiles(folders: readonly string[], files: FileAccess = diskFileAccess): Promise<BookmarkFile[]> {
  const found: BookmarkFile[] = [];
  for (const folder of folders) {
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
        if ((await files.size(path)) === undefined) continue;
        found.push({ id: `chrome:${profile}:${file}`, name: names.get(profile) ?? profile, kind, profile, path });
      }
    }
  }
  return found;
}
