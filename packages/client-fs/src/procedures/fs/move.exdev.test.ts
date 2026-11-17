/**
 * The move of `fs.move` to another device. `rename` fails with `EXDEV` there, so `move` copies the
 * source and then removes it. The mock gives `EXDEV` to each `rename` that the test names.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { move } from "./move.js";

const faults = { exdev: false, other: undefined as string | undefined };

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    rename: async (from: string, to: string): Promise<void> => {
      if (faults.other) throw Object.assign(new Error(`${faults.other}: rename`), { code: faults.other });
      if (faults.exdev) throw Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" });
      await actual.rename(from, to);
    },
  };
});

describe("fs.move to another device (EXDEV)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "move-exdev-"));
    faults.exdev = true;
    faults.other = undefined;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("copies a folder to the destination and removes the source", async () => {
    mkdirSync(join(root, "src", "sub"), { recursive: true });
    writeFileSync(join(root, "src", "a.txt"), "a");
    writeFileSync(join(root, "src", "sub", "b.txt"), "b");
    await move({ src: join(root, "src"), dest: join(root, "dest"), overwrite: false });
    expect(readFileSync(join(root, "dest", "a.txt"), "utf8")).toBe("a");
    expect(readFileSync(join(root, "dest", "sub", "b.txt"), "utf8")).toBe("b");
    expect(existsSync(join(root, "src"))).toBe(false);
  });

  it("replaces a file at the destination when overwrite is true", async () => {
    writeFileSync(join(root, "src.txt"), "new");
    writeFileSync(join(root, "dest.txt"), "old");
    await move({ src: join(root, "src.txt"), dest: join(root, "dest.txt"), overwrite: true });
    expect(readFileSync(join(root, "dest.txt"), "utf8")).toBe("new");
    expect(existsSync(join(root, "src.txt"))).toBe(false);
  });

  it("throws an error of rename other than EXDEV, and keeps the source", async () => {
    faults.other = "EACCES";
    writeFileSync(join(root, "src.txt"), "a");
    await expect(move({ src: join(root, "src.txt"), dest: join(root, "dest.txt"), overwrite: false })).rejects.toThrow(/EACCES/);
    expect(readFileSync(join(root, "src.txt"), "utf8")).toBe("a");
    expect(existsSync(join(root, "dest.txt"))).toBe(false);
  });
});
