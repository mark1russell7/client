/**
 * fs.write.json, fs.hash, fs.temp and fs.watch (roadmap R44), without and with a root.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputItems, outputValue, type ProcedureRegistry } from "@procedures/client";
import { createFsModule, fsModule } from "./module.js";
import type { FsHashOutput, FsTempOutput, FsWatchOutput, FsWriteJsonOutput } from "./types.js";

let folder: string;
const made: string[] = [];
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "fs-r44-"));
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
});

const plain: ProcedureRegistry = createRegistry(fsModule);
const pathOf = (key: string): string[] => ["fs", key.slice("fs.".length)];

async function call<T>(key: string, input: unknown, registry: ProcedureRegistry = plain): Promise<T> {
  return outputValue(await invokePath<T>(pathOf(key), input, { registry }), pathOf(key));
}

describe("fs.write.json (R44)", () => {
  it("writes the JSON of a value, and leaves no temporary file", async () => {
    const path = join(folder, "data.json");
    const result = await call<FsWriteJsonOutput>("fs.write.json", { path, value: { a: [1, 2], b: "x" } });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ a: [1, 2], b: "x" });
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
    expect(result.bytesWritten).toBe(readFileSync(path).length);
    expect(readdirSync(folder)).toEqual(["data.json"]);
  });

  it("needs a value, writes null, and refuses a value without a JSON form", async () => {
    const path = join(folder, "null.json");
    await expect(call("fs.write.json", { path })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await call("fs.write.json", { path, value: null });
    expect(readFileSync(path, "utf8")).toBe("null\n");
    await expect(call("fs.write.json", { path, value: () => 1 })).rejects.toThrow("no JSON form");
  });

  it("replaces a file, and keeps the old file when the folder does not exist", async () => {
    const path = join(folder, "data.json");
    writeFileSync(path, "old");
    await call("fs.write.json", { path, value: 1, indent: 0 });
    expect(readFileSync(path, "utf8")).toBe("1\n");
    await expect(call("fs.write.json", { path: join(folder, "missing", "x.json"), value: 1 })).rejects.toThrow();
  });
});

describe("fs.hash (R44)", () => {
  it("gives the hash and the size of a file", async () => {
    const path = join(folder, "file.txt");
    writeFileSync(path, "hello");
    const expected = createHash("sha256").update("hello").digest("hex");
    expect(await call<FsHashOutput>("fs.hash", { path })).toEqual({ path, algorithm: "sha256", hash: expected, size: 5 });
    expect((await call<FsHashOutput>("fs.hash", { path, algorithm: "md5" })).hash).toBe(createHash("md5").update("hello").digest("hex"));
    await expect(call("fs.hash", { path: join(folder, "missing") })).rejects.toThrow(/ENOENT/);
  });
});

describe("fs.temp (R44)", () => {
  it("makes a new folder each time", async () => {
    const one = await call<FsTempOutput>("fs.temp", { prefix: "r44-" });
    const two = await call<FsTempOutput>("fs.temp", {});
    made.push(one.path, two.path);
    expect(one.path).not.toBe(two.path);
    expect(existsSync(one.path) && existsSync(two.path)).toBe(true);
    await expect(call("fs.temp", { prefix: "../escape" })).rejects.toThrow();
  });
});

describe("fs.watch (R44)", () => {
  it("gives the changes of a folder until the reader stops", async () => {
    const output = await invokePath<FsWatchOutput>(["fs", "watch"], { path: folder }, { registry: plain });
    const items = outputItems(output)[Symbol.asyncIterator]();
    const first = items.next();
    // The watcher starts with the first read: give it a moment, then change the folder
    setTimeout(() => writeFileSync(join(folder, "new.txt"), "x"), 100);
    const change = await first;
    expect(change.done).toBe(false);
    expect(["rename", "change"]).toContain(change.value?.event);
    await items.return?.(undefined);
  });

  it("ends without an error when the call aborts", async () => {
    const controller = new AbortController();
    const output = await invokePath<FsWatchOutput>(["fs", "watch"], { path: folder, recursive: false }, { registry: plain, signal: controller.signal });
    const items = outputItems(output)[Symbol.asyncIterator]();
    const next = items.next();
    setTimeout(() => controller.abort(), 50);
    const result = await next.catch((error: unknown) => ({ error }));
    // The abort ends the stream: as its end, or as the ABORTED error of the invocation
    if ("error" in result) expect(result.error).toMatchObject({ code: "ABORTED" });
    else expect(result.done).toBe(true);
  });
});

describe("the new procedures with a root (R44)", () => {
  it("keep each path inside the root, and make temporary folders in .tmp", async () => {
    const rooted = createRegistry(createFsModule({ root: folder }));
    await call("fs.write.json", { path: "inside.json", value: true }, rooted);
    expect(readFileSync(join(folder, "inside.json"), "utf8")).toBe("true\n");
    await expect(call("fs.write.json", { path: "../outside.json", value: true }, rooted)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call("fs.hash", { path: join(tmpdir(), "x") }, rooted)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const temp = await call<FsTempOutput>("fs.temp", {}, rooted);
    expect(temp.path.startsWith(join(folder, ".tmp"))).toBe(true);
    expect((await call<FsHashOutput>("fs.hash", { path: "inside.json", algorithm: "sha1" }, rooted)).size).toBe(5);
    const watching = await invokePath<FsWatchOutput>(["fs", "watch"], { path: "." }, { registry: rooted });
    const changes = outputItems(watching)[Symbol.asyncIterator]();
    const first = changes.next();
    setTimeout(() => writeFileSync(join(folder, "seen.txt"), "x"), 100);
    expect((await first).done).toBe(false);
    await changes.return?.(undefined);
    await expect(invokePath(["fs", "watch"], { path: ".." }, { registry: rooted }).then((output) => outputItems(output)[Symbol.asyncIterator]().next())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
