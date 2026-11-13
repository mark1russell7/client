import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_BOOKMARKS_BYTES, parseChromeBookmarks } from "./bookmarks.js";
import { browserDataFolders, diskFileAccess, findBookmarkFiles, PROFILE_BROWSERS, readBookmarkFile, type FileAccess } from "./profiles.js";

const DATA = join("home", "chrome");
const EDGE = join("home", "edge");

/** A bookmarks file with one site in the bookmarks bar. Each site is fictional. */
const bookmarks = (url: string): string => JSON.stringify({ roots: { bookmark_bar: { type: "folder", name: "Bookmarks bar", guid: "bar", children: [{ type: "url", name: "A", url }] } } });

/** This function gives files in memory. */
function memory(contents: Record<string, string>): FileAccess {
  return {
    list: async (folder) => [...new Set(Object.keys(contents).filter((path) => path.startsWith(folder + "/") || path.startsWith(folder + "\\")).map((path) => path.slice(folder.length + 1).split(/[\\/]/)[0] ?? ""))],
    size: async (file) => contents[file]?.length,
    read: async (file) => {
      const text = contents[file];
      if (text === undefined) throw new Error(`no file ${file}`);
      return text;
    },
  };
}

const FILES = {
  [join(DATA, "Local State")]: JSON.stringify({ profile: { info_cache: { Default: { name: "Person 1" }, "Profile 2": { name: "Work" } } } }),
  [join(DATA, "Default", "Bookmarks")]: bookmarks("https://a.example/"),
  [join(DATA, "Default", "AccountBookmarks")]: bookmarks("https://b.example/"),
  [join(DATA, "Profile 10", "Bookmarks")]: bookmarks("https://c.example/"),
  [join(DATA, "Profile 2", "Bookmarks")]: bookmarks("https://d.example/"),
  [join(DATA, "Guest Profile", "Bookmarks")]: bookmarks("https://e.example/"),
  [join(DATA, "Profile 3", "Preferences")]: "{}",
};

/** This function gives the folder of each browser, by its key. */
const byBrowser = (...args: Parameters<typeof browserDataFolders>): Record<string, string> =>
  Object.fromEntries(browserDataFolders(...args).map(({ browser, folder }) => [browser, folder]));

describe("browserDataFolders", () => {
  it("gives the folder of Chrome, Edge and Chromium on Windows, from LOCALAPPDATA or from the home folder", () => {
    expect(byBrowser("win32", { LOCALAPPDATA: "D:\\Local" }, "C:\\Users\\u")).toEqual({
      chrome: "D:\\Local\\Google\\Chrome\\User Data",
      edge: "D:\\Local\\Microsoft\\Edge\\User Data",
      chromium: "D:\\Local\\Chromium\\User Data",
    });
    expect(byBrowser("win32", {}, "C:\\Users\\u")).toEqual({
      chrome: "C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\User Data",
      edge: "C:\\Users\\u\\AppData\\Local\\Microsoft\\Edge\\User Data",
      chromium: "C:\\Users\\u\\AppData\\Local\\Chromium\\User Data",
    });
  });

  it("gives the folder of Chrome, Edge and Chromium on macOS, and ignores XDG_CONFIG_HOME there", () => {
    expect(byBrowser("darwin", { XDG_CONFIG_HOME: "/cfg" }, "/Users/u")).toEqual({
      chrome: "/Users/u/Library/Application Support/Google/Chrome",
      edge: "/Users/u/Library/Application Support/Microsoft Edge",
      chromium: "/Users/u/Library/Application Support/Chromium",
    });
  });

  it("gives the folder of Chrome, Edge and Chromium on Linux, from XDG_CONFIG_HOME or from ~/.config", () => {
    expect(byBrowser("linux", {}, "/home/u")).toEqual({
      chrome: "/home/u/.config/google-chrome",
      edge: "/home/u/.config/microsoft-edge",
      chromium: "/home/u/.config/chromium",
    });
    expect(byBrowser("linux", { XDG_CONFIG_HOME: "/cfg" }, "/home/u")).toEqual({ chrome: "/cfg/google-chrome", edge: "/cfg/microsoft-edge", chromium: "/cfg/chromium" });
    // Another Unix uses the folders of Linux
    expect(byBrowser("freebsd", {}, "/home/u")["edge"]).toBe("/home/u/.config/microsoft-edge");
  });

  it("gives the browsers in the order of PROFILE_BROWSERS, or only the browsers that the caller names", () => {
    expect(PROFILE_BROWSERS).toEqual(["chrome", "edge", "chromium"]);
    expect(browserDataFolders("linux", {}, "/home/u").map((data) => data.browser)).toEqual([...PROFILE_BROWSERS]);
    expect(browserDataFolders("darwin", {}, "/Users/u", ["edge"])).toEqual([{ browser: "edge", folder: "/Users/u/Library/Application Support/Microsoft Edge" }]);
    expect(browserDataFolders("win32", {}, "C:\\Users\\u", [])).toEqual([]);
  });
});

describe("findBookmarkFiles", () => {
  it("finds the bookmarks files of each profile, with the names of the browser, in the order of the profiles", async () => {
    const found = await findBookmarkFiles([{ browser: "chrome", folder: DATA }], memory(FILES));
    expect(found.map(({ id, name, kind, browser, profile }) => [id, name, kind, browser, profile])).toEqual([
      ["chrome:Default:Bookmarks", "Person 1", "profile", "chrome", "Default"],
      ["chrome:Default:AccountBookmarks", "Person 1", "account", "chrome", "Default"],
      ["chrome:Profile 2:Bookmarks", "Work", "profile", "chrome", "Profile 2"],
      ["chrome:Profile 10:Bookmarks", "Profile 10", "profile", "chrome", "Profile 10"],
    ]);
    expect(found[2]?.path).toBe(join(DATA, "Profile 2", "Bookmarks"));
    expect(found[2]?.size).toBe(bookmarks("https://d.example/").length);
  });

  it("gives the files of two browsers with the same profiles different ids, in the order of the folders", async () => {
    const both = {
      ...FILES,
      [join(EDGE, "Local State")]: JSON.stringify({ profile: { info_cache: { Default: { name: "Person 1" } } } }),
      [join(EDGE, "Default", "Bookmarks")]: bookmarks("https://f.example/"),
    };
    const found = await findBookmarkFiles([{ browser: "edge", folder: EDGE }, { browser: "chrome", folder: DATA }], memory(both));
    expect(found.map(({ id, name, browser }) => [id, name, browser])).toEqual([
      ["edge:Default:Bookmarks", "Person 1", "edge"],
      ["chrome:Default:Bookmarks", "Person 1", "chrome"],
      ["chrome:Default:AccountBookmarks", "Person 1", "chrome"],
      ["chrome:Profile 2:Bookmarks", "Work", "chrome"],
      ["chrome:Profile 10:Bookmarks", "Profile 10", "chrome"],
    ]);
    expect(new Set(found.map((file) => file.id)).size).toBe(found.length);
    expect(found[0]?.path).toBe(join(EDGE, "Default", "Bookmarks"));
    // A key that the package does not know is also correct
    expect((await findBookmarkFiles([{ browser: "brave", folder: EDGE }], memory(both))).map((file) => file.id)).toEqual(["brave:Default:Bookmarks"]);
  });

  it("finds no file in a folder that does not exist, and reads the folders with a broken Local State", async () => {
    expect(await findBookmarkFiles([{ browser: "chrome", folder: join("no", "where") }], memory(FILES))).toEqual([]);
    const broken = { ...FILES, [join(DATA, "Local State")]: "{" };
    expect((await findBookmarkFiles([{ browser: "chrome", folder: DATA }], memory(broken))).map((source) => source.name)).toEqual(["Default", "Default", "Profile 2", "Profile 10"]);
  });

  it("reads a fictional profile folder on the disk with the default file access", async () => {
    const data = mkdtempSync(join(tmpdir(), "profiles-test-"));
    try {
      mkdirSync(join(data, "Default"));
      mkdirSync(join(data, "Profile 4", "Bookmarks"), { recursive: true });
      writeFileSync(join(data, "Default", "Bookmarks"), bookmarks("https://disk.example/"));
      const found = await findBookmarkFiles([
        { browser: "chrome", folder: data },
        { browser: "chromium", folder: join(data, "missing") },
      ]);
      // A folder with the name of a bookmarks file is not a file
      expect(found.map((file) => file.id)).toEqual(["chrome:Default:Bookmarks"]);
      const read = parseChromeBookmarks(JSON.parse(await diskFileAccess.read(found[0]!.path)));
      expect(read.roots[0]?.sites[0]?.url).toBe("https://disk.example/");
      expect(await diskFileAccess.size(join(data, "missing"))).toBeUndefined();
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });
});

describe("readBookmarkFile", () => {
  const FILE = { id: "chrome:Default:Bookmarks", path: join(DATA, "Default", "Bookmarks") };

  /** This function gives the files of FILES with the size `size` for each file, and counts the reads. */
  function sized(size: number | undefined): { files: FileAccess; reads: () => number } {
    let reads = 0;
    const base = memory(FILES);
    return {
      files: { ...base, size: async () => size, read: async (file) => (reads++, base.read(file)) },
      reads: () => reads,
    };
  }

  it("reads and parses a file that the search found, with the id of the file as the default prefix", async () => {
    const [found] = await findBookmarkFiles([{ browser: "chrome", folder: DATA }], memory(FILES));
    const read = await readBookmarkFile(found!, memory(FILES));
    expect(read.roots[0]?.key).toBe("chrome:Default:Bookmarks:bar");
    expect(read.roots[0]?.sites[0]?.url).toBe("https://a.example/");
    expect((await readBookmarkFile(FILE, memory(FILES), { prefix: "" })).roots[0]?.key).toBe("bar");
  });

  it("refuses a file over MAX_BOOKMARKS_BYTES before the read, and reads a file of exactly that size", async () => {
    const large = sized(MAX_BOOKMARKS_BYTES + 1);
    await expect(readBookmarkFile(FILE, large.files)).rejects.toThrow(`has ${MAX_BOOKMARKS_BYTES + 1} bytes. A bookmarks file has ${MAX_BOOKMARKS_BYTES} bytes at most.`);
    expect(large.reads()).toBe(0);
    const limit = sized(MAX_BOOKMARKS_BYTES);
    expect((await readBookmarkFile(FILE, limit.files)).roots).toHaveLength(1);
    expect(limit.reads()).toBe(1);
  });

  it("refuses a file that is gone, a file that is not JSON and a JSON value with no roots", async () => {
    const gone = sized(undefined);
    await expect(readBookmarkFile(FILE, gone.files)).rejects.toThrow("is not there now");
    expect(gone.reads()).toBe(0);
    const broken = memory({ ...FILES, [FILE.path]: "{ not json" });
    const error = await readBookmarkFile(FILE, broken).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/is not JSON, so it is not a bookmarks file/);
    expect((error as Error).cause).toBeInstanceOf(SyntaxError);
    await expect(readBookmarkFile(FILE, memory({ ...FILES, [FILE.path]: "{}" }))).rejects.toThrow("roots");
  });
});
