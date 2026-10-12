import { describe, it, expect } from "vitest";
import { fuzzyScore, search } from "./search";

describe("fuzzyScore", () => {
  it("matches the characters in order, and nothing else", () => {
    expect(fuzzyScore("gst", "git.status")).not.toBeNull();
    expect(fuzzyScore("tsg", "git.status")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("prefers a contained text, at the start of a word", () => {
    const start = fuzzyScore("status", "git.status")!;
    const inside = fuzzyScore("tatus", "git.status")!;
    const scattered = fuzzyScore("gsts", "git.status")!;
    expect(start).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(scattered);
  });
});

describe("search", () => {
  const items = [{ text: "client.add" }, { text: "client.chain" }, { text: "git.status" }, { text: "docker.ps" }];

  it("gives the best match first", () => {
    expect(search(items, "chain")[0]!.text).toBe("client.chain");
    expect(search(items, "gst").map((item) => item.text)).toEqual(["git.status"]);
  });

  it("keeps the order for an empty query, up to the limit", () => {
    expect(search(items, "", 2).map((item) => item.text)).toEqual(["client.add", "client.chain"]);
  });
});
