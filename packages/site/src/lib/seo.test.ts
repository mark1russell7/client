import { describe, it, expect } from "vitest";
import { procedures } from "../data";
import { metaOf, staticPages } from "./seo";

describe("the meta data of the pages", () => {
  it("has a page for each fixed route, each procedure and each package, with unique paths", () => {
    const pages = staticPages();
    expect(pages.map((page) => page.path)).toEqual(expect.arrayContaining(["", "composer", "catalog", "architecture", "lab", "claude", "status", "releases"]));
    expect(pages.filter((page) => page.path.startsWith("catalog/"))).toHaveLength(procedures.length);
    expect(new Set(pages.map((page) => page.path)).size).toBe(pages.length);
  });

  it("gives each page a title with the site name and a description of at most 160 characters", () => {
    for (const page of staticPages()) {
      expect(page.title, page.path).toMatch(/\| client$/);
      expect(page.description.length, page.path).toBeGreaterThan(20);
      expect(page.description.length, page.path).toBeLessThanOrEqual(160);
    }
  });

  it("has a page for the docs and for each document, with a title that starts with its words", () => {
    const paths = staticPages().map((page) => page.path);
    expect(paths).toContain("docs");
    expect(paths).toContain("docs/program-format");
    expect(paths).toContain("docs/packages/client-git");
    expect(metaOf({ page: "docs", rest: "program-format" })?.title).toMatch(/^Program format: .+ \| client$/);
    expect(metaOf({ page: "docs", rest: "packages/client-git" })?.title).toMatch(/^@procedures\/git: .+ \| client$/);
    expect(metaOf({ page: "docs", rest: "packages/no-such-package" })).toBeNull();
  });

  it("finds the page of a route, and has none for an unknown procedure or page", () => {
    expect(metaOf({ page: "catalog", rest: "client.chain" })?.heading).toMatch(/^client\.chain/);
    expect(metaOf({ page: "catalog", rest: "no.such.procedure" })).toBeNull();
    expect(metaOf({ page: "nowhere", rest: "" })).toBeNull();
    expect(metaOf({ page: "", rest: "" })?.path).toBe("");
  });

  it("ends the sentence of a procedure description before the next one", () => {
    const meta = metaOf({ page: "catalog", rest: "git.status" });
    expect(meta?.description).toMatch(/^[^.]+\. A procedure of /);
  });
});
