/**
 * writeFileAtomic and writeFileAtomicSync (roadmap O51 and O52) with faults of the file system: a
 * locked target, errors of `realpath`, `stat`, `unlink` and of the flush of the folder, and the
 * paths of Windows. Mocks of `node:fs/promises` and `node:fs` give the faults. They also record
 * the path and the mode of each new temporary file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as fsSync from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic, writeFileAtomicSync, type WriteFileAtomicOptions } from "./atomic.js";

type Fault = { left: number; error: () => Error };

const faults = vi.hoisted(() => ({
  rename: undefined as Fault | undefined,
  unlink: undefined as Fault | undefined,
  realpath: undefined as Fault | undefined,
  stat: undefined as Fault | undefined,
  folderOpen: undefined as Fault | undefined,
  renameCalls: 0,
  folderOpens: 0,
  temps: [] as { path: string; mode: number }[],
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
      const handle = await actual.open(...args);
      if (args[1] === "wx") faults.temps.push({ path: String(args[0]), mode: (await handle.stat()).mode & 0o777 });
      return handle;
    },
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fsSync>();
  const realpathSync = Object.assign((path: string) => actual.realpathSync(path), {
    native: (path: string): string => {
      const error = take(faults.realpath);
      if (error) throw error;
      return actual.realpathSync.native(path);
    },
  });
  return {
    ...actual,
    realpathSync,
    renameSync: (from: string, to: string): void => {
      faults.renameCalls++;
      const error = take(faults.rename);
      if (error) throw error;
      actual.renameSync(from, to);
    },
    unlinkSync: (path: string): void => {
      const error = take(faults.unlink);
      if (error) throw error;
      actual.unlinkSync(path);
    },
    statSync: (path: string) => {
      const error = take(faults.stat);
      if (error) throw error;
      return actual.statSync(path);
    },
    openSync: (...args: Parameters<typeof actual.openSync>): number => {
      if (args[1] === "r") {
        faults.folderOpens++;
        const error = take(faults.folderOpen);
        if (error) throw error;
      }
      const fd = actual.openSync(...args);
      if (args[1] === "wx") faults.temps.push({ path: String(args[0]), mode: actual.fstatSync(fd).mode & 0o777 });
      return fd;
    },
  };
});

type Write = (path: string, data: string | Uint8Array, options?: WriteFileAtomicOptions) => Promise<void>;

/** The two forms. The sync form runs in a promise, so a throw is a rejection. */
const forms: [string, Write][] = [
  ["writeFileAtomic", writeFileAtomic],
  ["writeFileAtomicSync", (path, data, options) => Promise.resolve().then(() => writeFileAtomicSync(path, data, options))],
];

const IS_WINDOWS = process.platform === "win32";

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

/** The removal of all the faults. */
function clearFaults(): void {
  Object.assign(faults, { rename: undefined, unlink: undefined, realpath: undefined, stat: undefined, folderOpen: undefined });
}

let folder: string;
beforeEach(async () => {
  folder = await fsPromises.mkdtemp(join(tmpdir(), "fs-atomic-faults-"));
  clearFaults();
  Object.assign(faults, { renameCalls: 0, folderOpens: 0, temps: [] });
});
afterEach(async () => {
  clearFaults();
  await fsPromises.rm(folder, { recursive: true, force: true });
});

describe.each(forms)("%s and a locked target", (_name, write) => {
  it.each(["EPERM", "EACCES", "EBUSY"])("tries the rename again after %s", async (code) => {
    faults.rename = { left: 2, error: coded(code) };
    const path = join(folder, "data.txt");
    await write(path, "data", { renameRetryMs: 1000 });
    expect(faults.renameCalls).toBe(3);
    expect(await fsPromises.readFile(path, "utf8")).toBe("data");
    expect(await fsPromises.readdir(folder)).toEqual(["data.txt"]);
  });

  it("stops after renameRetryMs, throws the error, and removes the temporary file", async () => {
    faults.rename = { left: 1000, error: coded("EBUSY") };
    const started = Date.now();
    await expect(write(join(folder, "data.txt"), "data", { renameRetryMs: 50 })).rejects.toMatchObject({ code: "EBUSY" });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(faults.renameCalls).toBeGreaterThan(1);
    expect(await fsPromises.readdir(folder)).toEqual([]);
  });

  it("does not try again after another error, or after an error without a code", async () => {
    faults.rename = { left: 1, error: coded("EXDEV") };
    await expect(write(join(folder, "data.txt"), "data", { renameRetryMs: 1000 })).rejects.toMatchObject({ code: "EXDEV" });
    expect(faults.renameCalls).toBe(1);
    faults.rename = { left: 1, error: () => new Error("no code") };
    await expect(write(join(folder, "data.txt"), "data", { renameRetryMs: 1000 })).rejects.toThrow("no code");
    expect(faults.renameCalls).toBe(2);
    expect(await fsPromises.readdir(folder)).toEqual([]);
  });

  it("tries again for 2000 ms by default on Windows, and for 0 ms on other platforms", async () => {
    const path = join(folder, "data.txt");
    faults.rename = { left: 2, error: coded("EPERM") };
    await onPlatform("win32", () => write(path, "windows"));
    expect(await fsPromises.readFile(path, "utf8")).toBe("windows");
    faults.rename = { left: 1, error: coded("EPERM") };
    await expect(onPlatform("linux", () => write(path, "linux"))).rejects.toMatchObject({ code: "EPERM" });
    expect(await fsPromises.readFile(path, "utf8")).toBe("windows");
  });
});

describe.each(forms)("%s and the flush of the folder", (_name, write) => {
  it("flushes the folder on Linux, and not on Windows", async () => {
    await onPlatform("linux", () => write(join(folder, "a.txt"), "a"));
    expect(faults.folderOpens).toBe(1);
    await onPlatform("win32", () => write(join(folder, "b.txt"), "b"));
    expect(faults.folderOpens).toBe(1);
    // With fsync false, no platform flushes the folder
    await onPlatform("linux", () => write(join(folder, "c.txt"), "c", { fsync: false }));
    expect(faults.folderOpens).toBe(1);
    expect(await fsPromises.readFile(join(folder, "b.txt"), "utf8")).toBe("b");
  });

  it("ignores a file system that cannot flush a folder", async () => {
    faults.folderOpen = { left: 1, error: coded("EINVAL") };
    await onPlatform("linux", () => write(join(folder, "data.txt"), "data"));
    expect(faults.folderOpens).toBe(1);
    expect(await fsPromises.readFile(join(folder, "data.txt"), "utf8")).toBe("data");
  });

  it("throws another error of the flush, after the file is in place", async () => {
    faults.folderOpen = { left: 1, error: coded("EIO") };
    await expect(onPlatform("linux", () => write(join(folder, "data.txt"), "data"))).rejects.toMatchObject({ code: "EIO" });
    expect(await fsPromises.readFile(join(folder, "data.txt"), "utf8")).toBe("data");
  });
});

describe.each(forms)("%s and other faults", (_name, write) => {
  it("throws an error of realpath other than a missing file", async () => {
    faults.realpath = { left: 1, error: coded("EACCES") };
    await expect(write(join(folder, "data.txt"), "data")).rejects.toMatchObject({ code: "EACCES" });
    expect(await fsPromises.readdir(folder)).toEqual([]);
  });

  it("throws an error of stat other than a missing file", async () => {
    await fsPromises.writeFile(join(folder, "data.txt"), "old");
    faults.stat = { left: 1, error: coded("EACCES") };
    await expect(write(join(folder, "data.txt"), "data")).rejects.toMatchObject({ code: "EACCES" });
    expect(await fsPromises.readFile(join(folder, "data.txt"), "utf8")).toBe("old");
  });

  it("clears the read-only flag when the removal of the temporary file gives EPERM", async () => {
    faults.rename = { left: 1, error: coded("EXDEV") };
    faults.unlink = { left: 1, error: coded("EPERM") };
    await expect(write(join(folder, "data.txt"), "data", { renameRetryMs: 0 })).rejects.toMatchObject({ code: "EXDEV" });
    expect(await fsPromises.readdir(folder)).toEqual([]);
  });

  it("throws the error of the write when the temporary file cannot be removed", async () => {
    faults.rename = { left: 1, error: coded("EXDEV") };
    faults.unlink = { left: 2, error: coded("EPERM") };
    await expect(write(join(folder, "data.txt"), "data", { renameRetryMs: 0 })).rejects.toMatchObject({ code: "EXDEV" });
    faults.rename = { left: 1, error: coded("EXDEV") };
    faults.unlink = { left: 1, error: coded("EBUSY") };
    await expect(write(join(folder, "data.txt"), "data", { renameRetryMs: 0 })).rejects.toMatchObject({ code: "EXDEV" });
    // The two temporary files stay: the function does not hide the error of the write
    expect((await fsPromises.readdir(folder)).filter((name) => name.endsWith(".tmp"))).toHaveLength(2);
  });
});

describe.each(forms)("%s and the temporary file", (_name, write) => {
  it("names the temporary file .<name>.<16 hex digits>.tmp by default, or with tempName", async () => {
    const path = join(folder, "settings.json");
    await write(path, "{}");
    await write(path, "{}", { tempName: (target) => `${target.length}.part` });
    const real = await fsPromises.realpath(folder);
    expect(faults.temps.map(({ path: temp }) => temp)).toEqual([
      expect.stringMatching(/[\\/]\.settings\.json\.[0-9a-f]{16}\.tmp$/),
      join(real, `${join(real, "settings.json").length}.part`),
    ]);
  });

  it("keeps 32 characters of a long name in the default name", async () => {
    const name = `${"n".repeat(40)}.txt`;
    await write(join(folder, name), "x");
    expect(faults.temps[0]!.path).toMatch(new RegExp(`[\\\\/]\\.${"n".repeat(32)}\\.[0-9a-f]{16}\\.tmp$`));
  });

  it.skipIf(IS_WINDOWS)("makes the temporary file of a 0o600 target with 0o600, before the data", async () => {
    const path = join(folder, ".env");
    await fsPromises.writeFile(path, "TOKEN=old\n");
    await fsPromises.chmod(path, 0o600);
    await write(path, "TOKEN=new\n");
    expect(faults.temps.map(({ mode }) => mode)).toEqual([0o600]);
    expect((await fsPromises.stat(path)).mode & 0o777).toBe(0o600);
  });

  it.skipIf(IS_WINDOWS)("makes the temporary file 0o600 for each final mode that hides the data, and sets the final mode", async () => {
    const path = join(folder, "key.pem");
    await write(path, "a", { mode: 0o400 });
    expect((await fsPromises.stat(path)).mode & 0o777).toBe(0o400);
    await write(path, "b", { mode: 0o700 });
    expect((await fsPromises.stat(path)).mode & 0o777).toBe(0o700);
    // A mode that lets the group read starts with that mode
    await write(path, "c", { mode: 0o640 });
    expect((await fsPromises.stat(path)).mode & 0o777).toBe(0o640);
    expect(faults.temps.map(({ mode }) => mode)).toEqual([0o600, 0o600, 0o640]);
    expect(await fsPromises.readFile(path, "utf8")).toBe("c");
  });
});
