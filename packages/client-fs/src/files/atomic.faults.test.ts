/**
 * writeFileAtomic (roadmap O51) with faults of the file system: a locked target, errors of
 * `realpath`, `stat`, `unlink` and of the flush of the folder, and the paths of Windows. A mock of
 * `node:fs/promises` gives the faults.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic.js";

type Fault = { left: number; error: () => Error };

const faults = vi.hoisted(() => ({
  rename: undefined as Fault | undefined,
  unlink: undefined as Fault | undefined,
  realpath: undefined as Fault | undefined,
  stat: undefined as Fault | undefined,
  folderOpen: undefined as Fault | undefined,
  renameCalls: 0,
  folderOpens: 0,
}));

/** The error of a fault, while the fault has calls left. */
function take(fault: Fault | undefined): Error | undefined {
  if (!fault || fault.left <= 0) return undefined;
  fault.left--;
  return fault.error();
}

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    rename: async (from: string, to: string): Promise<void> => {
      faults.renameCalls++;
      const error = take(faults.rename);
      if (error) throw error;
      await actual.rename(from, to);
    },
    unlink: async (path: string): Promise<void> => {
      const error = take(faults.unlink);
      if (error) throw error;
      await actual.unlink(path);
    },
    realpath: async (path: string): Promise<string> => {
      const error = take(faults.realpath);
      if (error) throw error;
      return actual.realpath(path);
    },
    stat: async (path: string) => {
      const error = take(faults.stat);
      if (error) throw error;
      return actual.stat(path);
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      // The flush of the folder opens it with "r". The temporary file opens with "wx".
      if (args[1] === "r") {
        faults.folderOpens++;
        const error = take(faults.folderOpen);
        if (error) throw error;
      }
      return actual.open(...args);
    },
  };
});

/** A Node.js error with a code. */
const coded = (code: string) => (): Error => Object.assign(new Error(`${code}: fault`), { code });

/** The platform for the time of `fn`. */
async function onPlatform<T>(platform: NodeJS.Platform, fn: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { ...original, value: platform });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process, "platform", original);
  }
}

let folder: string;
beforeEach(async () => {
  folder = await fsPromises.mkdtemp(join(tmpdir(), "fs-atomic-faults-"));
  Object.assign(faults, { rename: undefined, unlink: undefined, realpath: undefined, stat: undefined, folderOpen: undefined });
  Object.assign(faults, { renameCalls: 0, folderOpens: 0 });
});
afterEach(async () => {
  Object.assign(faults, { rename: undefined, unlink: undefined, realpath: undefined, stat: undefined, folderOpen: undefined });
  await fsPromises.rm(folder, { recursive: true, force: true });
});

describe("writeFileAtomic and a locked target", () => {
  it.each(["EPERM", "EACCES", "EBUSY"])("tries the rename again after %s", async (code) => {
    faults.rename = { left: 2, error: coded(code) };
    const path = join(folder, "data.txt");
    await writeFileAtomic(path, "data", { renameRetryMs: 1000 });
    expect(faults.renameCalls).toBe(3);
    expect(await fsPromises.readFile(path, "utf8")).toBe("data");
    expect(await fsPromises.readdir(folder)).toEqual(["data.txt"]);
  });

  it("stops after renameRetryMs, throws the error, and removes the temporary file", async () => {
    faults.rename = { left: 1000, error: coded("EBUSY") };
    await expect(writeFileAtomic(join(folder, "data.txt"), "data", { renameRetryMs: 50 })).rejects.toMatchObject({ code: "EBUSY" });
    expect(faults.renameCalls).toBeGreaterThan(1);
    expect(await fsPromises.readdir(folder)).toEqual([]);
  });

  it("does not try again after another error, or after an error without a code", async () => {
    faults.rename = { left: 1, error: coded("EXDEV") };
    await expect(writeFileAtomic(join(folder, "data.txt"), "data", { renameRetryMs: 1000 })).rejects.toMatchObject({ code: "EXDEV" });
    expect(faults.renameCalls).toBe(1);
    faults.rename = { left: 1, error: () => new Error("no code") };
    await expect(writeFileAtomic(join(folder, "data.txt"), "data", { renameRetryMs: 1000 })).rejects.toThrow("no code");
    expect(faults.renameCalls).toBe(2);
    expect(await fsPromises.readdir(folder)).toEqual([]);
  });

  it("tries again for 2000 ms by default on Windows, and for 0 ms on other platforms", async () => {
    const path = join(folder, "data.txt");
    faults.rename = { left: 2, error: coded("EPERM") };
    await onPlatform("win32", () => writeFileAtomic(path, "windows"));
    expect(await fsPromises.readFile(path, "utf8")).toBe("windows");
    faults.rename = { left: 1, error: coded("EPERM") };
    await expect(onPlatform("linux", () => writeFileAtomic(path, "linux"))).rejects.toMatchObject({ code: "EPERM" });
    expect(await fsPromises.readFile(path, "utf8")).toBe("windows");
  });
});

describe("writeFileAtomic and the flush of the folder", () => {
  it("flushes the folder on Linux, and not on Windows", async () => {
    await onPlatform("linux", () => writeFileAtomic(join(folder, "a.txt"), "a"));
    expect(faults.folderOpens).toBe(1);
    await onPlatform("win32", () => writeFileAtomic(join(folder, "b.txt"), "b"));
    expect(faults.folderOpens).toBe(1);
    // With fsync false, no platform flushes the folder
    await onPlatform("linux", () => writeFileAtomic(join(folder, "c.txt"), "c", { fsync: false }));
    expect(faults.folderOpens).toBe(1);
    expect(await fsPromises.readFile(join(folder, "b.txt"), "utf8")).toBe("b");
  });

  it("ignores a file system that cannot flush a folder", async () => {
    faults.folderOpen = { left: 1, error: coded("EINVAL") };
    await onPlatform("linux", () => writeFileAtomic(join(folder, "data.txt"), "data"));
    expect(faults.folderOpens).toBe(1);
    expect(await fsPromises.readFile(join(folder, "data.txt"), "utf8")).toBe("data");
  });

  it("throws another error of the flush, after the file is in place", async () => {
    faults.folderOpen = { left: 1, error: coded("EIO") };
    await expect(onPlatform("linux", () => writeFileAtomic(join(folder, "data.txt"), "data"))).rejects.toMatchObject({ code: "EIO" });
    expect(await fsPromises.readFile(join(folder, "data.txt"), "utf8")).toBe("data");
  });
});

describe("writeFileAtomic and other faults", () => {
  it("throws an error of realpath other than a missing file", async () => {
    faults.realpath = { left: 1, error: coded("EACCES") };
    await expect(writeFileAtomic(join(folder, "data.txt"), "data")).rejects.toMatchObject({ code: "EACCES" });
    expect(await fsPromises.readdir(folder)).toEqual([]);
  });

  it("throws an error of stat other than a missing file", async () => {
    await fsPromises.writeFile(join(folder, "data.txt"), "old");
    faults.stat = { left: 1, error: coded("EACCES") };
    await expect(writeFileAtomic(join(folder, "data.txt"), "data")).rejects.toMatchObject({ code: "EACCES" });
    expect(await fsPromises.readFile(join(folder, "data.txt"), "utf8")).toBe("old");
  });

  it("clears the read-only flag when the removal of the temporary file gives EPERM", async () => {
    faults.rename = { left: 1, error: coded("EXDEV") };
    faults.unlink = { left: 1, error: coded("EPERM") };
    await expect(writeFileAtomic(join(folder, "data.txt"), "data", { renameRetryMs: 0 })).rejects.toMatchObject({ code: "EXDEV" });
    expect(await fsPromises.readdir(folder)).toEqual([]);
  });

  it("throws the error of the write when the temporary file cannot be removed", async () => {
    faults.rename = { left: 1, error: coded("EXDEV") };
    faults.unlink = { left: 2, error: coded("EPERM") };
    await expect(writeFileAtomic(join(folder, "data.txt"), "data", { renameRetryMs: 0 })).rejects.toMatchObject({ code: "EXDEV" });
    faults.rename = { left: 1, error: coded("EXDEV") };
    faults.unlink = { left: 1, error: coded("EBUSY") };
    await expect(writeFileAtomic(join(folder, "data.txt"), "data", { renameRetryMs: 0 })).rejects.toMatchObject({ code: "EXDEV" });
    // The two temporary files stay: the function does not hide the error of the write
    expect((await fsPromises.readdir(folder)).filter((name) => name.endsWith(".tmp"))).toHaveLength(2);
  });
});
