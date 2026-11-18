import { describe, it, expect } from "vitest";
import { mcpTools, packages, procedures } from "../data";
import { counts } from "../data/site";
import { metaOf, needsCatalog, staticPages } from "./seo";

const catalog = { procedures, packages };

describe("the meta data of the pages", () => {
  it("has a page for each fixed route, each procedure and each package, with unique paths", () => {
    const pages = staticPages(catalog);
    expect(pages.map((page) => page.path)).toEqual(expect.arrayContaining(["", "composer", "catalog", "architecture", "lab", "claude", "status", "releases"]));
    expect(pages.filter((page) => page.path.startsWith("catalog/"))).toHaveLength(procedures.length);
    expect(new Set(pages.map((page) => page.path)).size).toBe(pages.length);
  });

  it("gives each page a title with the site name and a description of at most 160 characters", () => {
    for (const page of staticPages(catalog)) {
      expect(page.title, page.path).toMatch(/\| client$/);
      expect(page.description.length, page.path).toBeGreaterThan(20);
      expect(page.description.length, page.path).toBeLessThanOrEqual(160);
    }
  });

  it("has a page for the docs and for each document, with a title that starts with its words", () => {
    const paths = staticPages(catalog).map((page) => page.path);
    expect(paths).toContain("docs");
    expect(paths).toContain("docs/program-format");
    expect(paths).toContain("docs/packages/client-git");
    expect(metaOf({ page: "docs", rest: "program-format" })?.title).toMatch(/^Program format: .+ \| client$/);
    expect(metaOf({ page: "docs", rest: "packages/client-git" })?.title).toMatch(/^@procedures\/git: .+ \| client$/);
    expect(metaOf({ page: "docs", rest: "packages/no-such-package" })).toBeNull();
  });

  it("finds the page of a route, and has none for an unknown procedure or page", () => {
    expect(metaOf({ page: "catalog", rest: "client.chain" }, catalog)?.heading).toMatch(/^client\.chain/);
    expect(metaOf({ page: "catalog", rest: "no.such.procedure" }, catalog)).toBeNull();
    expect(metaOf({ page: "architecture", rest: "client" }, catalog)?.heading).toBe("@procedures/client package");
    expect(metaOf({ page: "architecture", rest: "no-such-package" }, catalog)).toBeNull();
    expect(metaOf({ page: "nowhere", rest: "" })).toBeNull();
    expect(metaOf({ page: "", rest: "" })?.path).toBe("");
  });

  it("waits for the catalog only on the page of a procedure or of a package", () => {
    expect(needsCatalog({ page: "catalog", rest: "git.status" })).toBe(true);
    expect(needsCatalog({ page: "architecture", rest: "client" })).toBe(true);
    expect(needsCatalog({ page: "catalog", rest: "" })).toBe(false);
    expect(needsCatalog({ page: "docs", rest: "program-format" })).toBe(false);
    expect(metaOf({ page: "catalog", rest: "git.status" })).toBeUndefined();
    expect(metaOf({ page: "architecture", rest: "client" })).toBeUndefined();
    expect(metaOf({ page: "catalog", rest: "" })?.path).toBe("catalog");
  });

  it("gives the counts of the small module of each page, equal to the catalog", () => {
    expect(counts.procedures).toBe(procedures.length);
    expect(counts.packages).toBe(packages.length);
    expect(counts.mcpTools).toBe(mcpTools.length);
    expect(counts.lines).toBe(packages.reduce((total, pkg) => total + pkg.lines, 0));
    expect(metaOf({ page: "catalog", rest: "" })?.heading).toBe(`Procedure catalog: ${procedures.length} typed procedures`);
  });

  it("ends the sentence of a procedure description before the next one", () => {
    const meta = metaOf({ page: "catalog", rest: "git.status" }, catalog);
    expect(meta?.description).toMatch(/^[^.]+\. A procedure of /);
  });
});
