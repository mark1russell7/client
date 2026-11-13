import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_BOOKMARK_DEPTH, chromeTime, parseChromeBookmarks, profileNames, type Bookmark, type BookmarkFolder } from "./bookmarks.js";

/** 2020-01-01T00:00:00.000Z as a Chrome time: microseconds from 1601-01-01. */
const NEW_YEAR_2020 = "13222310400000000";

/** A bookmarks file in the shape that Chrome writes. Each site is fictional. */
const FILE = {
  checksum: "0",
  version: 1,
  roots: {
    other: { type: "folder", name: "Other bookmarks", guid: "g-other", id: "2", children: [{ type: "url", name: "Docs", url: "https://docs.example/", date_added: "0", guid: "g-u3", id: "7" }] },
    bookmark_bar: {
      type: "folder",
      name: "Bookmarks bar",
      guid: "g-bar",
      id: "1",
      children: [
        { type: "url", name: "News", url: "https://news.example/", date_added: NEW_YEAR_2020, guid: "g-u1", id: "4" },
        { type: "url", name: "Script", url: "javascript:alert(1)", guid: "g-u2", id: "5" },
        {
          type: "folder",
          name: "Design",
          guid: "g-design",
          id: "6",
          children: [
            { type: "url", name: "", url: "https://a.example/", guid: "g-u4", id: "8" },
            { type: "folder", name: "Fonts", guid: "g-fonts", id: "9", children: [{ type: "url", name: "Type", url: "https://type.example/", guid: "g-u5", id: "10" }] },
          ],
        },
      ],
    },
    synced: { type: "folder", name: "Mobile bookmarks", guid: "g-synced", id: "3", children: [] },
    sync_transaction_version: "12",
  },
};

function allFolders(roots: readonly BookmarkFolder[]): BookmarkFolder[] {
  const out: BookmarkFolder[] = [];
  const go = (folder: BookmarkFolder): void => {
    out.push(folder);
    folder.folders.forEach(go);
  };
  roots.forEach(go);
  return out;
}

const allSites = (roots: readonly BookmarkFolder[]): Bookmark[] => allFolders(roots).flatMap((folder) => folder.sites);

describe("chromeTime", () => {
  it("gives the ISO time of a Chrome time", () => {
    expect(chromeTime(NEW_YEAR_2020)).toBe("2020-01-01T00:00:00.000Z");
    // A Chrome time is larger than a safe integer, so a conversion with Number loses the microseconds
    expect(chromeTime("13222310400123456")).toBe("2020-01-01T00:00:00.123Z");
  });

  it("gives no time for 0, for a text that is not a number, and for a time out of range", () => {
    for (const value of ["0", "", "12a", "-5", 13222310400000000, undefined, "999999999999999999999"]) expect(chromeTime(value), String(value)).toBeUndefined();
  });
});

describe("parseChromeBookmarks", () => {
  const { roots, skipped, problems } = parseChromeBookmarks(FILE);

  it("reads the roots in the order of Chrome, and skips a value of the roots that is not a folder", () => {
    expect(roots.map((root) => root.name)).toEqual(["Bookmarks bar", "Other bookmarks", "Mobile bookmarks"]);
    expect(problems).toEqual([]);
  });

  it("gives each site the names of its folders as its path, its title and the time it was added", () => {
    expect(allSites(roots)).toEqual([
      { url: "https://news.example/", title: "News", added: "2020-01-01T00:00:00.000Z", path: ["Bookmarks bar"] },
      { url: "https://a.example/", path: ["Bookmarks bar", "Design"] },
      { url: "https://type.example/", title: "Type", path: ["Bookmarks bar", "Design", "Fonts"] },
      { url: "https://docs.example/", title: "Docs", path: ["Other bookmarks"] },
    ]);
  });

  it("counts the bookmarks that are not web sites, and keeps them out", () => {
    expect(skipped).toBe(1);
    expect(roots[0]?.total).toBe(3);
  });

  it("tests a long address in linear time", () => {
    // Two quantifiers that agree on "!" make a failed test of this address take quadratic time.
    const url = `http://${"!".repeat(100_000)} `;
    const file = { roots: { bookmark_bar: { type: "folder", name: "Bar", guid: "g-long", children: [{ type: "url", name: "Long", url, guid: "g-l" }] } } };
    const start = performance.now();
    expect(parseChromeBookmarks(file).skipped).toBe(1);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("gives the keys of the guids, after the prefix", () => {
    expect(roots[0]?.key).toBe("g-bar");
    const account = parseChromeBookmarks(FILE, { prefix: "account:" });
    expect(account.roots[0]?.key).toBe("account:g-bar");
    expect(account.roots[0]?.folders[0]?.key).toBe("account:g-design");
  });

  it("gives a problem for each part that it cannot read, and reads the other parts", () => {
    const bad = parseChromeBookmarks({
      roots: { bookmark_bar: { type: "folder", name: "Bar", children: [7, { type: "separator" }, { type: "url", url: "https://ok.example/" }, { type: "folder", name: "X", children: "no" }] } },
    });
    expect(bad.problems.map((problem) => problem.message)).toEqual([
      "A bookmark must be an object.",
      "A bookmark has the type separator, not url or folder.",
      "The children of a folder must be a list.",
    ]);
    expect(bad.roots[0]?.total).toBe(1);
  });

  it("puts the roots with other names after the roots of Chrome, in the order of their code units, not of a locale", () => {
    const folder = (name: string): Record<string, unknown> => ({ type: "folder", name, guid: `g-${name}` });
    const read = parseChromeBookmarks({ roots: { a_extra: folder("a_extra"), other: folder("Other"), Z_extra: folder("Z_extra"), bookmark_bar: folder("Bar") } });
    // A locale puts "a" before "Z", but the code unit of "Z" (0x5A) comes before the code unit of "a" (0x61)
    expect(["a_extra", "Z_extra"].sort((a, b) => a.localeCompare(b, "en"))).toEqual(["a_extra", "Z_extra"]);
    expect(read.roots.map((root) => root.name)).toEqual(["Bar", "Other", "Z_extra", "a_extra"]);
    // The order of the keys in the file does not change the order of the roots
    const reversed = parseChromeBookmarks({ roots: { bookmark_bar: folder("Bar"), Z_extra: folder("Z_extra"), other: folder("Other"), a_extra: folder("a_extra") } });
    expect(reversed.roots.map((root) => root.name)).toEqual(["Bar", "Other", "Z_extra", "a_extra"]);
  });

  it("gives a folder with no name the key of its root, or the name Folder", () => {
    const read = parseChromeBookmarks({ roots: { other: { type: "folder", children: [{ type: "folder", name: "", children: [] }] } } });
    expect(read.roots[0]?.name).toBe("other");
    expect(read.roots[0]?.folders[0]?.path).toEqual(["other", "Folder"]);
  });

  it("gives a folder with no guid and no id the key of its place, so two sibling folders with one name have different keys", () => {
    const twin = (site: string): Record<string, unknown> => ({ type: "folder", name: "Same", children: [{ type: "folder", name: "Inner", children: [{ type: "url", url: site }] }] });
    const value = { roots: { bookmark_bar: { type: "folder", name: "Bar", children: [{ type: "url", url: "https://first.example/" }, twin("https://a.example/"), twin("https://b.example/")] } } };
    const read = parseChromeBookmarks(value, { prefix: "p:" });
    const bar = read.roots[0]!;
    expect(bar.key).toBe("p:bookmark_bar");
    expect(bar.folders.map((folder) => folder.key)).toEqual(["p:bookmark_bar/1", "p:bookmark_bar/2"]);
    // The two folders Inner have the same names on their paths, but different places
    expect(bar.folders.map((folder) => folder.folders[0]?.key)).toEqual(["p:bookmark_bar/1/0", "p:bookmark_bar/2/0"]);
    expect(parseChromeBookmarks(value, { prefix: "p:" })).toEqual(read);
  });

  it("uses an id of text or number as the key, and the place for an empty or other id", () => {
    const value = {
      roots: {
        bookmark_bar: {
          type: "folder",
          name: "Bar",
          id: 1,
          children: [
            { type: "folder", name: "A", id: "7" },
            { type: "folder", name: "B", id: "" },
            { type: "folder", name: "C", id: { n: 1 }, guid: "" },
          ],
        },
      },
    };
    const bar = parseChromeBookmarks(value).roots[0]!;
    expect([bar.key, ...bar.folders.map((folder) => folder.key)]).toEqual(["1", "7", "bookmark_bar/1", "bookmark_bar/2"]);
  });

  it("refuses a value with no roots", () => {
    for (const value of [null, [], "x", {}, { roots: [] }]) expect(() => parseChromeBookmarks(value)).toThrow("roots");
  });

  it("stops at the deepest folder, with a problem, and does not overflow the stack", () => {
    let node: Record<string, unknown> = { type: "folder", name: "deep", children: [{ type: "url", url: "https://deep.example/" }] };
    for (let i = 0; i < 5000; i++) node = { type: "folder", name: `f${i}`, children: [node] };
    const read = parseChromeBookmarks({ roots: { bookmark_bar: node } });
    expect(read.problems).toHaveLength(1);
    expect(read.problems[0]?.path).toHaveLength(MAX_BOOKMARK_DEPTH);
    expect(read.roots[0]?.total).toBe(0);
  });
});

/** A random bookmarks node: a folder with sites, other bookmarks and folders in it. Each site is fictional. */
type RandomNode = { readonly type: "folder"; readonly children: readonly RandomNode[] } | { readonly type: "url"; readonly web: boolean; readonly site: number };

const randomNode: fc.Arbitrary<RandomNode> = fc.letrec<{ node: RandomNode }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.record({ type: fc.constant("url" as const), web: fc.boolean(), site: fc.nat(40) }),
    fc.record({ type: fc.constant("folder" as const), children: fc.array(tie("node"), { maxLength: 5 }) }),
  ),
})).node;

/** This function gives the JSON of Chrome for a random node, with a new id and guid for each node. */
function chromeNode(node: RandomNode, ids: { next: number }): Record<string, unknown> {
  const id = ids.next++;
  if (node.type === "url") {
    const url = node.web ? `https://s${node.site}.example/${id}` : `chrome://settings/${id}`;
    return { type: "url", name: `S${id}`, url, guid: `u${id}`, id: String(id), date_added: String(13_222_310_400_000_000 + id) };
  }
  return { type: "folder", name: `F${id}`, guid: `f${id}`, id: String(id), children: node.children.map((child) => chromeNode(child, ids)) };
}

describe("parseChromeBookmarks on random files", () => {
  it("keeps each site in the folder of its path, and keeps the counts and the keys equal", () => {
    const folder = fc.record({ type: fc.constant("folder" as const), children: fc.array(randomNode, { maxLength: 6 }) });
    fc.assert(
      fc.property(folder, folder, (bar, other) => {
        const ids = { next: 1 };
        const file = { roots: { bookmark_bar: chromeNode(bar, ids), other: chromeNode(other, ids) } };
        const { roots, skipped, problems } = parseChromeBookmarks(file);
        expect(problems).toEqual([]);
        const folders = allFolders(roots);
        for (const each of folders) {
          for (const site of each.sites) expect(site.path).toEqual(each.path);
          expect(each.total).toBe(each.sites.length + each.folders.reduce((sum, inner) => sum + inner.total, 0));
        }
        const sites = allSites(roots);
        expect(roots.reduce((sum, root) => sum + root.total, 0)).toBe(sites.length);
        expect(sites.every((site) => site.url.startsWith("https://") && site.added !== undefined)).toBe(true);
        expect(sites.length + skipped).toBe(JSON.stringify(file).split('"type":"url"').length - 1);
        expect(new Set(folders.map((each) => each.key)).size).toBe(folders.length);
      }),
      { numRuns: 200, seed: 20_261_112 },
    );
  });
});

describe("profileNames", () => {
  it("gives the name of each profile from the file Local State", () => {
    const names = profileNames({ profile: { info_cache: { Default: { name: "Person 1" }, "Profile 2": { name: "Work" }, "Profile 3": { name: " " }, bad: null } } });
    expect([...names]).toEqual([
      ["Default", "Person 1"],
      ["Profile 2", "Work"],
    ]);
    for (const value of [null, 3, {}, { profile: { info_cache: "x" } }]) expect(profileNames(value).size).toBe(0);
  });
});
