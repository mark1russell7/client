import { describe, expect, it, vi } from "vitest";

// A Node without node:sqlite (before 22.13 without the flag): the import of the package works,
// and the first read gives an error that names the Node version. The package loads node:sqlite
// through @mark1russell7/sqlite, and that import fails on such a Node.
vi.mock("@mark1russell7/sqlite", () => {
  throw new Error("No such built-in module: node:sqlite");
});

describe("a Node without node:sqlite", () => {
  it("imports the package, and refuses the first read with a clear error", async () => {
    const { readSmsDatabase } = await import("./backup.js");
    await expect(readSmsDatabase("unused.db")).rejects.toThrow(/Node 22\.13 or later/);
  });
});
