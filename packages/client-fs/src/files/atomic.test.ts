/**
 * writeFileAtomic (roadmap O51): the content, the cleanup after a failure, no partial file for a
 * reader, and the permissions.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic.js";

const IS_WINDOWS = process.platform === "win32";

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "fs-atomic-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
  it("writes a new file, replaces a file, and takes bytes", async () => {
    const path = join(folder, "data.txt");
    await writeFileAtomic(path, "first");
    expect(await readFile(path, "utf8")).toBe("first");
    await writeFileAtomic(path, "second ünïcode");
    expect(await readFile(path, "utf8")).toBe("second ünïcode");
    await writeFileAtomic(path, Buffer.from([0, 1, 2, 255]));
    expect([...(await readFile(path))]).toEqual([0, 1, 2, 255]);
    await writeFileAtomic(path, "6869", { encoding: "hex", fsync: false });
    expect(await readFile(path, "utf8")).toBe("hi");
    expect(await readdir(folder)).toEqual(["data.txt"]);
  });

  it("removes the temporary file when the write fails, and keeps the old file", async () => {
    const path = join(folder, "data.txt");
    await writeFile(path, "old");
    // A value that is not a string or bytes fails after the temporary file exists
    await expect(writeFileAtomic(path, 42 as unknown as string)).rejects.toThrow();
    expect(await readdir(folder)).toEqual(["data.txt"]);
    expect(await readFile(path, "utf8")).toBe("old");
  });

  it("removes the temporary file when the rename fails", async () => {
    // A folder at the path of the target: the rename of a file over it fails
    const path = join(folder, "target");
    await mkdir(path);
    await expect(writeFileAtomic(path, "data", { renameRetryMs: 0 })).rejects.toThrow();
    expect(await readdir(folder)).toEqual(["target"]);
  });

  it("fails without a temporary file when the folder does not exist", async () => {
    await expect(writeFileAtomic(join(folder, "missing", "data.txt"), "data")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(folder)).toEqual([]);
  });

  it("never shows a part of a file to a reader: each read is one whole version", { timeout: 30_000 }, async () => {
    const path = join(folder, "big.txt");
    const size = 256 * 1024;
    const versions = ["a", "b", "c"].map((letter) => letter.repeat(size));
    await writeFile(path, "o".repeat(size));
    let writing = true;
    const seen = new Set<string>();
    const reader = (async () => {
      while (writing) {
        let text: string;
        try {
          text = await readFile(path, "utf8");
        } catch (error) {
          // Windows can refuse an open for a short time during the rename. A refusal is not a partial file.
          if (IS_WINDOWS && ["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
          throw error;
        }
        expect(text.length).toBe(size);
        expect(text).toBe(text[0]!.repeat(size));
        seen.add(text[0]!);
        // On Windows, an open handle of the target blocks a rename over it. A reader that never stops leaves no time for the rename.
        if (IS_WINDOWS) await new Promise((resolve) => setTimeout(resolve, 10));
      }
    })();
    const writes: Promise<void>[] = [];
    for (let round = 0; round < 4; round++) {
      for (const version of versions) writes.push(writeFileAtomic(path, version, { fsync: false, renameRetryMs: 15_000 }));
    }
    try {
      await Promise.all(writes);
    } finally {
      writing = false;
      await reader;
    }
    const final = await readFile(path, "utf8");
    expect(versions).toContain(final);
    expect(seen.size).toBeGreaterThan(0);
    expect(await readdir(folder)).toEqual(["big.txt"]);
  });

  it.skipIf(IS_WINDOWS)("keeps the permissions of the target, and sets the permissions of options.mode", async () => {
    const path = join(folder, "secret.env");
    await writeFile(path, "A=1\n");
    await chmod(path, 0o640);
    await writeFileAtomic(path, "A=2\n");
    expect((await stat(path)).mode & 0o777).toBe(0o640);
    await writeFileAtomic(path, "A=3\n", { mode: 0o600 });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    // The umask does not change the mode of a new file with options.mode
    await writeFileAtomic(join(folder, "open.txt"), "x", { mode: 0o666 });
    expect((await stat(join(folder, "open.txt"))).mode & 0o777).toBe(0o666);
  });

  it("keeps a writable target writable on each platform", async () => {
    const path = join(folder, "data.txt");
    await writeFile(path, "old");
    const before = (await stat(path)).mode;
    await writeFileAtomic(path, "new");
    expect((await stat(path)).mode).toBe(before);
  });

  it.skipIf(IS_WINDOWS)("writes through a symlink, and the link stays a link", async () => {
    const real = join(folder, "real.txt");
    const link = join(folder, "link.txt");
    await writeFile(real, "old");
    await symlink(real, link);
    await writeFileAtomic(link, "new");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(real, "utf8")).toBe("new");
  });
});
