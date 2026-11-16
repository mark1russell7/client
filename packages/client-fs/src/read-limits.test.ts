/**
 * The limit of the loaded bytes of `fs.read` and `fs.read.json`, and the part of a file that
 * `offset` and `length` give. The warning test comes first: the warning comes one time in a module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { fsModule } from "./module.js";
import type { ReadJsonOutput, ReadOutput } from "./types.js";

const registry: ProcedureRegistry = createRegistry(fsModule);

/** This function starts a procedure of the registry, with the validation of its input and output. */
async function call<T>(key: string, input: unknown): Promise<T> {
  const path = key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "client-fs-read-limits-"));
  writeFileSync(join(dir, "a.txt"), "alpha");
  writeFileSync(join(dir, "c.json"), JSON.stringify({ name: "c" }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("the limit of the bytes that fs.read loads", () => {
  it("writes one warning for the first read over 16 MiB without maxBytes, and reads the file", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const size = 16 * 1024 * 1024 + 1;
    writeFileSync(join(dir, "large.txt"), Buffer.alloc(size, 97));
    const first = await call<ReadOutput>("fs.read", { path: join(dir, "large.txt") });
    expect(first.content.length).toBe(size);
    await call<ReadOutput>("fs.read", { path: join(dir, "large.txt") });
    expect(warn.mock.calls).toEqual([
      ["@procedures/fs 0.64.0 refuses a read over 16777216 bytes without the input maxBytes. Set maxBytes to read a larger file."],
    ]);
    // With maxBytes, the same read gives the error and no warning
    await expect(call("fs.read", { path: join(dir, "large.txt"), maxBytes: 1024 })).rejects.toMatchObject({ code: "ERR_FS_FILE_TOO_LARGE" });
    expect(warn).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("reads a file at the limit, and refuses a file over it", async () => {
    expect((await call<ReadOutput>("fs.read", { path: join(dir, "a.txt"), maxBytes: 5 })).content).toBe("alpha");
    const refusal = call("fs.read", { path: join(dir, "a.txt"), maxBytes: 4 });
    await expect(refusal).rejects.toBeInstanceOf(RangeError);
    await expect(refusal).rejects.toMatchObject({ code: "ERR_FS_FILE_TOO_LARGE" });
    await expect(refusal).rejects.toThrow("has more than 4 bytes, the limit maxBytes");
  });

  it("reads the part that offset and length give, and compares only the part with the limit", async () => {
    const part = async (input: object): Promise<string> =>
      (await call<ReadOutput>("fs.read", { path: join(dir, "a.txt"), ...input })).content;
    expect(await part({ offset: 1, length: 3 })).toBe("lph");
    expect(await part({ offset: 3 })).toBe("ha");
    expect(await part({ offset: 10 })).toBe("");
    expect(await part({ length: 0 })).toBe("");
    expect(await part({ length: 2 })).toBe("al");
    expect(await part({ offset: 1, length: 3, maxBytes: 3 })).toBe("lph");
    expect(await part({ offset: 2, maxBytes: 3 })).toBe("pha");
    await expect(part({ offset: 1, length: 3, maxBytes: 2 })).rejects.toMatchObject({ code: "ERR_FS_FILE_TOO_LARGE" });
  });

  it.runIf(process.platform === "linux")("counts the bytes of a file of the system that has no size", async () => {
    // A file of /proc has the size 0, so only the count during the read finds the limit
    const status = await call<ReadOutput>("fs.read", { path: "/proc/self/status" });
    expect(status.content.length).toBeGreaterThan(10);
    await expect(call("fs.read", { path: "/proc/self/status", maxBytes: 10 })).rejects.toMatchObject({ code: "ERR_FS_FILE_TOO_LARGE" });
  });

  it("gives maxBytes to fs.read.json", async () => {
    const result = await call<ReadJsonOutput>("fs.read.json", { path: join(dir, "c.json"), maxBytes: 100 });
    expect(result.data).toEqual({ name: "c" });
    await expect(call("fs.read.json", { path: join(dir, "c.json"), maxBytes: 3 })).rejects.toMatchObject({ code: "ERR_FS_FILE_TOO_LARGE" });
  });

  it("validates the part and the limit, and refuses an unknown encoding", async () => {
    for (const input of [{ offset: -1 }, { length: 1.5 }, { maxBytes: -2 }, { maxBytes: "10" }]) {
      await expect(call("fs.read", { path: join(dir, "a.txt"), ...input })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    await expect(call("fs.read", { path: join(dir, "a.txt"), encoding: "nope" })).rejects.toMatchObject({ code: "ERR_INVALID_ARG_VALUE" });
  });
});
