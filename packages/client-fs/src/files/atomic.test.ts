/**
 * writeFileAtomic and writeFileAtomicSync (roadmap O51 and O52): the content, the cleanup after a
 * failure, no partial file for a reader, the permissions and the option tempName.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic, writeFileAtomicSync, type WriteFileAtomicOptions } from "./atomic.js";

const IS_WINDOWS = process.platform === "win32";

type Write = (path: string, data: string | Uint8Array, options?: WriteFileAtomicOptions) => Promise<void>;

/** The two forms. The sync form runs in a promise, so a throw is a rejection. */
const forms: [string, Write][] = [
  ["writeFileAtomic", writeFileAtomic],
  ["writeFileAtomicSync", (path, data, options) => Promise.resolve().then(() => writeFileAtomicSync(path, data, options))],
];

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "fs-atomic-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe.each(forms)("%s", (_name, write) => {
  it("writes a new file, replaces a file, and takes bytes", async () => {
    const path = join(folder, "data.txt");
    await write(path, "first");
    expect(await readFile(path, "utf8")).toBe("first");
    await write(path, "second ünïcode");
    expect(await readFile(path, "utf8")).toBe("second ünïcode");
    await write(path, Buffer.from([0, 1, 2, 255]));
    expect([...(await readFile(path))]).toEqual([0, 1, 2, 255]);
    await write(path, "6869", { encoding: "hex", fsync: false });
    expect(await readFile(path, "utf8")).toBe("hi");
    expect(await readdir(folder)).toEqual(["data.txt"]);
  });

  it("removes the temporary file when the write fails, and keeps the old file", async () => {
    const path = join(folder, "data.txt");
    await writeFile(path, "old");
    // A value that is not a string or bytes fails after the temporary file exists
    await expect(write(path, 42 as unknown as string)).rejects.toThrow();
    expect(await readdir(folder)).toEqual(["data.txt"]);
    expect(await readFile(path, "utf8")).toBe("old");
  });

  it("removes the temporary file when the rename fails", async () => {
    // A folder at the path of the target: the rename of a file over it fails
    const path = join(folder, "target");
    await mkdir(path);
    await expect(write(path, "data", { renameRetryMs: 0 })).rejects.toThrow();
    expect(await readdir(folder)).toEqual(["target"]);
  });

  it("fails without a temporary file when the folder does not exist", async () => {
    await expect(write(join(folder, "missing", "data.txt"), "data")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(folder)).toEqual([]);
  });

  it.skipIf(IS_WINDOWS)("keeps the permissions of the target, and sets the permissions of options.mode", async () => {
    const path = join(folder, "secret.env");
    await writeFile(path, "A=1\n");
    await chmod(path, 0o640);
    await write(path, "A=2\n");
    expect((await stat(path)).mode & 0o777).toBe(0o640);
    await write(path, "A=3\n", { mode: 0o600 });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    // A target that the owner can only read stays so, and the write still replaces it
    await chmod(path, 0o400);
    await write(path, "A=4\n");
    expect((await stat(path)).mode & 0o777).toBe(0o400);
    expect(await readFile(path, "utf8")).toBe("A=4\n");
    // The umask does not change the mode of a new file with options.mode
    await write(join(folder, "open.txt"), "x", { mode: 0o666 });
    expect((await stat(join(folder, "open.txt"))).mode & 0o777).toBe(0o666);
  });

  it("keeps a writable target writable on each platform", async () => {
    const path = join(folder, "data.txt");
    await writeFile(path, "old");
    const before = (await stat(path)).mode;
    await write(path, "new");
    expect((await stat(path)).mode).toBe(before);
  });

  it.skipIf(IS_WINDOWS)("writes through a symlink, and the link stays a link", async () => {
    const real = join(folder, "real.txt");
    const link = join(folder, "link.txt");
    await writeFile(real, "old");
    await symlink(real, link);
    await write(link, "new");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(real, "utf8")).toBe("new");
  });

  it("gives tempName the absolute target, and uses its name for the temporary file", async () => {
    const path = join(folder, "data.txt");
    const targets: string[] = [];
    await write(path, "data", { tempName: (target) => (targets.push(target), "data.txt.next") });
    // A target that exists gives its real path
    await write(path, "data", { tempName: (target) => (targets.push(target), "data.txt.next") });
    expect(targets).toEqual([path, join(await realpath(folder), "data.txt")]);
    expect(await readFile(path, "utf8")).toBe("data");
    expect(await readdir(folder)).toEqual(["data.txt"]);
    // A file at the name of the temporary file stops the write: the temporary file must be new
    await writeFile(join(folder, "taken.tmp"), "other");
    await expect(write(path, "new", { tempName: () => "taken.tmp" })).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(path, "utf8")).toBe("data");
    expect(await readFile(join(folder, "taken.tmp"), "utf8")).toBe("other");
  });

  it.each(["a/b.tmp", "a\\b.tmp", "../up.tmp", "", ".", "..", "data.txt", 42])(
    "refuses the temporary name %j and writes nothing",
    async (name) => {
      const path = join(folder, "data.txt");
      await writeFile(path, "old");
      const error = await write(path, "new", { tempName: () => name as string }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(TypeError);
      expect(error).toMatchObject({ code: "ERR_INVALID_ARG_VALUE" });
      expect((error as Error).message).toBe(
        `The option tempName gave ${JSON.stringify(name)}. Give the name of a new file in the folder of the target, without "/" or "\\".`,
      );
      expect(await readdir(folder)).toEqual(["data.txt"]);
      expect(await readFile(path, "utf8")).toBe("old");
    },
  );
});

describe("writeFileAtomic and parallel readers", () => {
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
});
