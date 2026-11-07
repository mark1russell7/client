import { describe, expect, it } from "vitest";
import { FAILPOINT_MARK, failpointSplit } from "./storage-tests.js";

describe("the two runs of the storage tests", () => {
  it("a file that sets a failpoint runs alone, and each other file runs in the first run", () => {
    const texts = new Map([
      ["src/storage/b.test.ts", `await admin.command({ ${FAILPOINT_MARK}: "failCommand", mode: "off" });`],
      ["src/storage/a.test.ts", "it(\"writes\", () => {});"],
      ["src/storage/c.test.ts", "it(\"reads\", () => {});"],
    ]);
    expect(failpointSplit([...texts.keys()], (file) => texts.get(file)!)).toEqual({
      together: ["src/storage/a.test.ts", "src/storage/c.test.ts"],
      alone: ["src/storage/b.test.ts"],
    });
  });

  it("with no file that sets a failpoint, each file runs together", () => {
    expect(failpointSplit(["x.test.ts"], () => "")).toEqual({ together: ["x.test.ts"], alone: [] });
  });
});
