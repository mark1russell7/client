import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { withTemporaryFolder } from "./run.js";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "run-test-"));
}

describe("withTemporaryFolder", () => {
  it("gives a new folder in the given folder to use, gives the value of use, and then removes the folder", async () => {
    const parent = scratch();
    let seen = "";
    const value = await withTemporaryFolder("work-", parent, async (path) => {
      seen = path;
      writeFileSync(join(path, "a.txt"), "a");
      mkdirSync(join(path, "b", "c"), { recursive: true });
      return 42;
    });
    expect(value).toBe(42);
    expect(dirname(seen)).toBe(parent);
    expect(basename(seen).startsWith("work-")).toBe(true);
    expect(readdirSync(parent)).toEqual([]);
  });

  it("removes the folder and gives the error of use when use throws", async () => {
    const parent = scratch();
    await expect(
      withTemporaryFolder("work-", parent, async (path) => {
        writeFileSync(join(path, "a.txt"), "a");
        throw new Error("the render failed");
      }),
    ).rejects.toThrow("the render failed");
    expect(readdirSync(parent)).toEqual([]);
  });

  it("gives the value of use when use removed the folder itself", async () => {
    const parent = scratch();
    const value = await withTemporaryFolder("work-", parent, async (path) => {
      rmSync(path, { recursive: true });
      return "done";
    });
    expect(value).toBe("done");
    expect(readdirSync(parent)).toEqual([]);
  });

  it("makes the folder in the temporary folder of the system without a folder", async () => {
    const seen = await withTemporaryFolder("procedures-run-test-", undefined, async (path) => path);
    expect(dirname(seen)).toBe(tmpdir());
  });
});
