/**
 * editFile (roadmap O51): no lost update of parallel edits, parallel edits of two paths, no write
 * for the same text, and a missing file.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as tick } from "node:timers/promises";
import { editFile } from "./edit.js";

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "fs-edit-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("editFile", () => {
  it("serializes parallel edits of one path: 20 increments give 20", async () => {
    const path = join(folder, "count.txt");
    await writeFile(path, "0");
    const edits = Array.from({ length: 20 }, () =>
      editFile(path, async (current) => {
        // A wait between the read and the write: without the lock, the edits lose updates
        await tick();
        return String(Number(current) + 1);
      }),
    );
    await Promise.all(edits);
    expect(await readFile(path, "utf8")).toBe("20");
    expect(await readdir(folder)).toEqual(["count.txt"]);
  });

  it("serializes two spellings of one path", async () => {
    await mkdir(join(folder, "sub"));
    const path = join(folder, "sub", "count.txt");
    const other = join(folder, "sub", "..", "sub", ".", process.platform === "win32" ? "COUNT.TXT" : "count.txt");
    await writeFile(path, "0");
    const increment = async (current: string | undefined): Promise<string> => {
      await tick();
      return String(Number(current) + 1);
    };
    await Promise.all(Array.from({ length: 10 }, (_, n) => editFile(n % 2 === 0 ? path : other, increment)));
    expect(await readFile(path, "utf8")).toBe("10");
  });

  it("runs the edits of two paths in parallel", async () => {
    let enterB = (): void => undefined;
    const bEntered = new Promise<void>((resolve) => {
      enterB = resolve;
    });
    // The edit of a waits for the edit of b. With one lock for all paths, this test does not end.
    const a = editFile(join(folder, "a.txt"), async () => {
      await bEntered;
      return "a";
    });
    const b = editFile(join(folder, "b.txt"), () => {
      enterB();
      return "b";
    });
    await Promise.all([a, b]);
    expect(await readFile(join(folder, "a.txt"), "utf8")).toBe("a");
  });

  it("does not write the same text", async () => {
    const path = join(folder, "same.txt");
    await writeFile(path, "same");
    const before = await stat(path);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await editFile(path, (current) => current)).toEqual({ changed: false, content: "same" });
    const after = await stat(path);
    // A write replaces the file: a new inode and a new time
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it("gives undefined or initial for a missing file, and writes nothing for undefined", async () => {
    const path = join(folder, "new.json");
    let seen: string | undefined = "not called";
    expect(
      await editFile(path, (current) => {
        seen = current;
        return undefined;
      }),
    ).toEqual({ changed: false, content: undefined });
    expect(seen).toBeUndefined();
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });

    const result = await editFile(path, (current) => `${current.slice(0, -1)}"a":1}`, { initial: "{}" });
    expect(result).toEqual({ changed: true, content: '{"a":1}' });
    expect(await readFile(path, "utf8")).toBe('{"a":1}');
  });

  it("writes initial when the transform keeps it for a missing file", async () => {
    const path = join(folder, "made.txt");
    expect(await editFile(path, (current) => current, { initial: "start" })).toEqual({ changed: true, content: "start" });
    expect(await readFile(path, "utf8")).toBe("start");
  });

  it("lets the next edit run after a failed transform", async () => {
    const path = join(folder, "env");
    await writeFile(path, "A=1\n");
    const failed = editFile(path, () => {
      throw new Error("no");
    });
    const next = editFile(path, (current) => `${current}B=2\n`);
    await expect(failed).rejects.toThrow("no");
    await next;
    expect(await readFile(path, "utf8")).toBe("A=1\nB=2\n");
  });

  it("throws a read error other than a missing file", async () => {
    // A folder at the path: the read fails with EISDIR, not ENOENT
    await mkdir(join(folder, "dir"));
    await expect(editFile(join(folder, "dir"), () => "x")).rejects.toMatchObject({ code: "EISDIR" });
  });
});
