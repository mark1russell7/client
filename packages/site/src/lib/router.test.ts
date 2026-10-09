import { describe, it, expect } from "vitest";
import { href, parseHash, safeDecode } from "./router";

describe("the router (deep dive SITE-6)", () => {
  it("keeps a hash that is not valid percent-encoding", () => {
    // Before, decodeURIComponent threw a URIError and the page was white
    expect(() => parseHash("#/catalog/%E0%A4")).not.toThrow();
    expect(parseHash("#/catalog/%E0%A4").rest).toBe("%E0%A4");
    expect(safeDecode("git.status%20x")).toBe("git.status x");
  });

  it("reads the page, the rest and the query", () => {
    const route = parseHash("#/composer?p=abc&example=chain");
    expect(route.page).toBe("composer");
    expect(route.query.get("p")).toBe("abc");
    expect(parseHash("#/catalog/git.status").rest).toBe("git.status");
    expect(parseHash("").page).toBe("");
  });

  it("makes links and leaves out empty query values", () => {
    expect(href("catalog", "git.status")).toBe("#/catalog/git.status");
    expect(href("catalog", undefined, { q: "add", package: "" })).toBe("#/catalog?q=add");
  });
});
