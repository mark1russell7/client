/**
 * The filters of the catalog and the data of its chart of packages.
 */

import { describe, it, expect } from "vitest";
import { matchesExceptPackage, matchesFilters, narrows, packageBars, visibleBars, type CatalogEntry, type CatalogFilters } from "./catalog";

const ALL: CatalogFilters = { query: "", pkg: "", onlyMcp: false, onlyCli: false, onlyBrowser: false, showUnregistered: true };

function entry(key: string, pkg: string, flags: Partial<CatalogEntry> = {}): CatalogEntry {
  return { key, package: pkg, description: "", registered: true, cli: false, browser: false, mcp: false, ...flags };
}

const ENTRIES: CatalogEntry[] = [
  entry("git.status", "client-git", { cli: true, mcp: true, description: "The status of the work tree" }),
  entry("git.log", "client-git", { cli: true }),
  entry("git.commit", "client-git", { cli: true }),
  entry("docker.ps", "client-docker", { cli: true, mcp: true }),
  entry("docker.run", "client-docker", { registered: false }),
  entry("math.add", "client", { browser: true }),
  entry("json.parse", "client-json", { browser: true, cli: true }),
];

describe("the filters", () => {
  it("matches each procedure without a filter", () => {
    expect(ENTRIES.every((candidate) => matchesFilters(candidate, ALL))).toBe(true);
    expect(narrows(ALL)).toBe(false);
  });

  it("applies each flag, the search and the package", () => {
    const keys = (filters: CatalogFilters): string[] => ENTRIES.filter((candidate) => matchesFilters(candidate, filters)).map((candidate) => candidate.key);
    expect(keys({ ...ALL, onlyMcp: true })).toEqual(["git.status", "docker.ps"]);
    expect(keys({ ...ALL, onlyBrowser: true, onlyCli: true })).toEqual(["json.parse"]);
    expect(keys({ ...ALL, showUnregistered: false })).not.toContain("docker.run");
    expect(keys({ ...ALL, query: "  WORK tree " })).toEqual(["git.status"]);
    expect(keys({ ...ALL, pkg: "client-docker" })).toEqual(["docker.ps", "docker.run"]);
  });

  it("ignores the package filter in matchesExceptPackage", () => {
    const filters = { ...ALL, pkg: "client-docker" };
    expect(matchesFilters(ENTRIES[0]!, filters)).toBe(false);
    expect(matchesExceptPackage(ENTRIES[0]!, filters)).toBe(true);
    expect(narrows(filters)).toBe(false);
    expect(narrows({ ...ALL, query: "git" })).toBe(true);
    expect(narrows({ ...ALL, showUnregistered: false })).toBe(true);
  });
});

describe("packageBars", () => {
  it("gives one bar for each package, the largest first, then by name", () => {
    const bars = packageBars(ENTRIES, ALL);
    expect(bars.map((bar) => bar.pkg)).toEqual(["client-git", "client-docker", "client", "client-json"]);
    expect(bars[0]).toEqual({ pkg: "client-git", total: 3, matching: 3, mcp: 1, cli: 3, browser: 0 });
  });

  it("counts the matches without the package filter, and keeps the order", () => {
    const all = packageBars(ENTRIES, ALL).map((bar) => bar.pkg);
    const bars = packageBars(ENTRIES, { ...ALL, onlyMcp: true, pkg: "client-git" });
    expect(bars.map((bar) => bar.pkg)).toEqual(all);
    expect(bars.map((bar) => bar.matching)).toEqual([1, 1, 0, 0]);
    expect(bars.map((bar) => bar.total)).toEqual([3, 2, 1, 1]);
  });

  it("never counts more matches than procedures", () => {
    for (const filters of [ALL, { ...ALL, onlyCli: true }, { ...ALL, query: "zzz" }]) {
      for (const bar of packageBars(ENTRIES, filters)) expect(bar.matching).toBeLessThanOrEqual(bar.total);
    }
  });

  it("gives no bar without procedures", () => {
    expect(packageBars([], ALL)).toEqual([]);
  });
});

describe("visibleBars", () => {
  const bars = packageBars(ENTRIES, ALL);

  it("gives the first bars", () => {
    expect(visibleBars(bars, 2, "").map((bar) => bar.pkg)).toEqual(["client-git", "client-docker"]);
    expect(visibleBars(bars, 2, "client-git").map((bar) => bar.pkg)).toEqual(["client-git", "client-docker"]);
  });

  it("adds the selected package when it is not one of the first bars", () => {
    expect(visibleBars(bars, 2, "client-json").map((bar) => bar.pkg)).toEqual(["client-git", "client-docker", "client-json"]);
    expect(visibleBars(bars, 2, "no-such-package")).toHaveLength(2);
  });
});
