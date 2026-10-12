import { describe, it, expect } from "vitest";
import { normalizeBase } from "./base";
import { href, legacyHashUrl, parseLocation, routePath, safeDecode } from "./router";

describe("the router", () => {
  it("keeps a path that is not valid percent-encoding (deep dive SITE-6)", () => {
    // Before, decodeURIComponent threw a URIError and the page was white
    expect(() => parseLocation("/client/catalog/%E0%A4", "", "/client/")).not.toThrow();
    expect(parseLocation("/client/catalog/%E0%A4", "", "/client/").rest).toBe("%E0%A4");
    expect(safeDecode("git.status%20x")).toBe("git.status x");
  });

  it("reads the page, the rest and the query below the base", () => {
    const route = parseLocation("/client/composer", "?p=abc&example=chain", "/client/");
    expect(route.page).toBe("composer");
    expect(route.query.get("p")).toBe("abc");
    expect(parseLocation("/client/catalog/git.status", "", "/client/").rest).toBe("git.status");
    expect(parseLocation("/client/", "", "/client/").page).toBe("");
    expect(parseLocation("/client", "", "/client/").page).toBe("");
  });

  it("reads the files that the build writes: composer.html, catalog/index.html, index.html", () => {
    expect(parseLocation("/client/composer.html", "", "/client/").page).toBe("composer");
    expect(parseLocation("/client/index.html", "", "/client/").page).toBe("");
    expect(parseLocation("/client/catalog/", "", "/client/")).toMatchObject({ page: "catalog", rest: "" });
  });

  it("makes links below the base and leaves out empty query values", () => {
    expect(href("catalog", "git.status", undefined, "/client/")).toBe("/client/catalog/git.status/");
    expect(href("catalog", undefined, { q: "add", package: "" }, "/client/")).toBe("/client/catalog/?q=add");
    expect(href("", undefined, undefined, "/client/")).toBe("/client/");
  });

  it("gives the route path of the HTML file of a page", () => {
    expect(routePath({ page: "catalog", rest: "git.status" })).toBe("catalog/git.status");
    expect(routePath({ page: "", rest: "" })).toBe("");
  });

  it("moves an old hash link to the path form, with its program", () => {
    expect(legacyHashUrl("#/composer?p=abc", "/client/")).toBe("/client/composer/?p=abc");
    expect(legacyHashUrl("#/catalog/git.status", "/client/")).toBe("/client/catalog/git.status/");
    expect(legacyHashUrl("#/", "/client/")).toBe("/client/");
    // An anchor is not a route
    expect(legacyHashUrl("#main", "/client/")).toBeNull();
    expect(legacyHashUrl("", "/client/")).toBeNull();
  });

  it("normalizes a base", () => {
    expect(normalizeBase("client")).toBe("/client/");
    expect(normalizeBase("/client")).toBe("/client/");
    expect(normalizeBase(undefined)).toBe("/");
    expect(normalizeBase("https://example.com/x")).toBe("https://example.com/x/");
  });
});
