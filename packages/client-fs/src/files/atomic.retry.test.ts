/**
 * writeFileAtomic (roadmap O51): the rename tries again after a lock of an antivirus or an
 * indexer. A mock of `rename` gives the errors of such a lock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic.js";

const failures = vi.hoisted(() => ({ left: 0, code: "EPERM", calls: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    rename: async (from: string, to: string): Promise<void> => {
      failures.calls++;
      if (failures.left > 0) {
        failures.left--;
        throw Object.assign(new Error(`${failures.code}: locked`), { code: failures.code });
      }
      await actual.rename(from, to);
    },
  };
});

let folder: string;
beforeEach(async () => {
  folder = await fsPromises.mkdtemp(join(tmpdir(), "fs-atomic-retry-"));
  failures.calls = 0;
});
afterEach(async () => {
  await fsPromises.rm(folder, { recursive: true, force: true });
});

describe("writeFileAtomic and a locked target", () => {
  it.each(["EPERM", "EACCES", "EBUSY"])("tries the rename again after %s", async (code) => {
    Object.assign(failures, { left: 2, code });
    const path = join(folder, "data.txt");
    await writeFileAtomic(path, "data", { renameRetryMs: 1000 });
    expect(failures.calls).toBe(3);
    expect(await fsPromises.readFile(path, "utf8")).toBe("data");
    expect(await fsPromises.readdir(folder)).toEqual(["data.txt"]);
  });

  it("stops after renameRetryMs, throws the error, and removes the temporary file", async () => {
    Object.assign(failures, { left: 1000, code: "EBUSY" });
    const path = join(folder, "data.txt");
    await expect(writeFileAtomic(path, "data", { renameRetryMs: 50 })).rejects.toMatchObject({ code: "EBUSY" });
    expect(failures.calls).toBeGreaterThan(1);
    expect(await fsPromises.readdir(folder)).toEqual([]);
    failures.left = 0;
  });

  it("does not try again after another error", async () => {
    Object.assign(failures, { left: 1, code: "EXDEV" });
    await expect(writeFileAtomic(join(folder, "data.txt"), "data", { renameRetryMs: 1000 })).rejects.toMatchObject({ code: "EXDEV" });
    expect(failures.calls).toBe(1);
    expect(await fsPromises.readdir(folder)).toEqual([]);
  });
});
