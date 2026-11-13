import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseChromeBookmarks } from "./bookmarks.js";
import { chromeDataFolders, diskFileAccess, findBookmarkFiles, type FileAccess } from "./profiles.js";

const DATA = join("home", "chrome");

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

describe("chromeDataFolders", () => {
  it("gives the folder of the user data of Chrome on each platform", () => {
    expect(chromeDataFolders("win32", { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "C:\\Users\\u")).toEqual([join("C:\\Users\\u\\AppData\\Local", "Google", "Chrome", "User Data")]);
    expect(chromeDataFolders("win32", {}, "C:\\Users\\u")).toEqual([join("C:\\Users\\u", "AppData", "Local", "Google", "Chrome", "User Data")]);
    expect(chromeDataFolders("darwin", {}, "/Users/u")).toEqual([join("/Users/u", "Library", "Application Support", "Google", "Chrome")]);
    expect(chromeDataFolders("linux", {}, "/home/u")).toEqual([join("/home/u", ".config", "google-chrome")]);
    expect(chromeDataFolders("linux", { XDG_CONFIG_HOME: "/cfg" }, "/home/u")).toEqual([join("/cfg", "google-chrome")]);
  });
});

describe("findBookmarkFiles", () => {
  it("finds the bookmarks files of each profile, with the names of Chrome, in the order of the profiles", async () => {
    const found = await findBookmarkFiles([DATA], memory(FILES));
    expect(found.map(({ id, name, kind, profile }) => [id, name, kind, profile])).toEqual([
      ["chrome:Default:Bookmarks", "Person 1", "profile", "Default"],
      ["chrome:Default:AccountBookmarks", "Person 1", "account", "Default"],
      ["chrome:Profile 2:Bookmarks", "Work", "profile", "Profile 2"],
      ["chrome:Profile 10:Bookmarks", "Profile 10", "profile", "Profile 10"],
    ]);
    expect(found[2]?.path).toBe(join(DATA, "Profile 2", "Bookmarks"));
  });

  it("finds no file in a folder that does not exist, and reads the folders with a broken Local State", async () => {
    expect(await findBookmarkFiles([join("no", "where")], memory(FILES))).toEqual([]);
    const broken = { ...FILES, [join(DATA, "Local State")]: "{" };
    expect((await findBookmarkFiles([DATA], memory(broken))).map((source) => source.name)).toEqual(["Default", "Default", "Profile 2", "Profile 10"]);
  });

  it("reads a fictional profile folder on the disk with the default file access", async () => {
    const data = mkdtempSync(join(tmpdir(), "profiles-test-"));
    mkdirSync(join(data, "Default"));
    mkdirSync(join(data, "Profile 4", "Bookmarks"), { recursive: true });
    writeFileSync(join(data, "Default", "Bookmarks"), bookmarks("https://disk.example/"));
    const found = await findBookmarkFiles([data, join(data, "missing")]);
    // A folder with the name of a bookmarks file is not a file
    expect(found.map((file) => file.id)).toEqual(["chrome:Default:Bookmarks"]);
    const read = parseChromeBookmarks(JSON.parse(await diskFileAccess.read(found[0]!.path)));
    expect(read.roots[0]?.sites[0]?.url).toBe("https://disk.example/");
    expect(await diskFileAccess.size(join(data, "missing"))).toBeUndefined();
  });
});
