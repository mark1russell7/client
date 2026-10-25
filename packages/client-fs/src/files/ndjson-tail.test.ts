/**
 * healNdjsonTail (roadmap O51): each state of the end of a file, and a large file, where the
 * function reads only the tail. A wrapper of `open` counts the bytes that each handle reads.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { healNdjsonTail } from "./ndjson-tail.js";

const reads = vi.hoisted(() => ({ bytes: 0, wholeFile: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const read = handle.read.bind(handle) as (...rest: unknown[]) => Promise<{ bytesRead: number }>;
      const readFile = handle.readFile.bind(handle);
      Object.assign(handle, {
        read: async (...rest: unknown[]) => {
          const result = await read(...rest);
          reads.bytes += result.bytesRead;
          return result;
        },
        readFile: (...rest: Parameters<typeof readFile>) => {
          reads.wholeFile++;
          return readFile(...rest);
        },
      });
      return handle;
    },
  };
});

const { readFile, writeFile, mkdtemp, rm, stat } = fsPromises;

let folder: string;
let path: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "fs-ndjson-"));
  path = join(folder, "log.ndjson");
  reads.bytes = 0;
  reads.wholeFile = 0;
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const line = (n: number, pad = ""): string => `${JSON.stringify({ n, pad })}\n`;

describe("healNdjsonTail", () => {
  it("does nothing for a file that does not exist, and does not make it", async () => {
    expect(await healNdjsonTail(path)).toEqual({ action: "none", bytes: 0, size: 0 });
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does nothing for an empty file", async () => {
    await writeFile(path, "");
    expect(await healNdjsonTail(path)).toEqual({ action: "none", bytes: 0, size: 0 });
    expect(await readFile(path, "utf8")).toBe("");
  });

  it("does nothing for a file that ends in a newline, and reads one byte", async () => {
    const good = line(1) + line(2);
    await writeFile(path, good);
    expect(await healNdjsonTail(path)).toEqual({ action: "none", bytes: 0, size: Buffer.byteLength(good) });
    expect(await readFile(path, "utf8")).toBe(good);
    expect(reads.bytes).toBe(1);
  });

  it("cuts off a partial last line", async () => {
    const good = line(1) + line(2);
    const torn = '{"n":3,"pad":"ab';
    await writeFile(path, good + torn);
    expect(await healNdjsonTail(path)).toEqual({ action: "truncated", bytes: torn.length, size: good.length });
    expect(await readFile(path, "utf8")).toBe(good);
  });

  it("cuts a file of one partial line to empty", async () => {
    await writeFile(path, '{"n":1');
    expect(await healNdjsonTail(path)).toEqual({ action: "truncated", bytes: 6, size: 0 });
    expect(await readFile(path, "utf8")).toBe("");
  });

  it("adds the newline to a complete last record, and keeps the record", async () => {
    const good = line(1);
    const whole = JSON.stringify({ n: 2, text: "ünï" });
    await writeFile(path, good + whole);
    const size = Buffer.byteLength(good + whole);
    expect(await healNdjsonTail(path)).toEqual({ action: "newline", bytes: 1, size: size + 1 });
    expect(await readFile(path, "utf8")).toBe(`${good + whole}\n`);
  });

  it("keeps a complete only record, also after a byte order mark", async () => {
    await writeFile(path, `﻿${JSON.stringify({ n: 1 })}`);
    expect((await healNdjsonTail(path)).action).toBe("newline");
    expect(await readFile(path, "utf8")).toBe(`﻿${JSON.stringify({ n: 1 })}\n`);
  });

  it("keeps a complete record of a CRLF file, and cuts a line of spaces", async () => {
    await writeFile(path, `{"n":1}\r\n{"n":2}\r`);
    expect((await healNdjsonTail(path)).action).toBe("newline");
    expect(await readFile(path, "utf8")).toBe(`{"n":1}\r\n{"n":2}\r\n`);
    await writeFile(path, `{"n":1}\n   `);
    expect((await healNdjsonTail(path)).action).toBe("truncated");
    expect(await readFile(path, "utf8")).toBe(`{"n":1}\n`);
  });

  it("finds the start of a partial line that is longer than one read", async () => {
    const good = line(1);
    const torn = `{"n":2,"pad":"${"y".repeat(200 * 1024)}`;
    await writeFile(path, good + torn);
    expect(await healNdjsonTail(path)).toEqual({ action: "truncated", bytes: torn.length, size: good.length });
    expect(await readFile(path, "utf8")).toBe(good);
  });

  it("reads only the tail of a large file, never the whole file", async () => {
    const lines: string[] = [];
    for (let n = 0; n < 4096; n++) lines.push(line(n, "x".repeat(1000)));
    const good = lines.join("");
    const torn = '{"n":4096,"pad":"xx';
    await writeFile(path, good + torn);
    reads.bytes = 0;
    const result = await healNdjsonTail(path);
    expect(result).toEqual({ action: "truncated", bytes: torn.length, size: good.length });
    expect(good.length).toBeGreaterThan(4_000_000);
    // One byte, then one chunk of 64 KiB at most
    expect(reads.bytes).toBeLessThanOrEqual(64 * 1024 + 1);
    expect(reads.wholeFile).toBe(0);
    const healed = await readFile(path, "utf8");
    expect(healed.length).toBe(good.length);
    expect(healed.endsWith(lines.at(-1)!)).toBe(true);
  });

  it("makes the same repairs without a flush (fsync: false)", async () => {
    await writeFile(path, `${line(1)}{"n":2`);
    expect((await healNdjsonTail(path, { fsync: false })).action).toBe("truncated");
    await writeFile(path, `${line(1)}{"n":2}`);
    expect((await healNdjsonTail(path, { fsync: false })).action).toBe("newline");
    expect(await readFile(path, "utf8")).toBe(`${line(1)}{"n":2}\n`);
  });

  // Windows opens a folder for a write, so only the other platforms give EISDIR
  it.skipIf(process.platform === "win32")("throws an error of the open other than a missing file", async () => {
    await fsPromises.mkdir(join(folder, "dir"));
    await expect(healNdjsonTail(join(folder, "dir"))).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("refuses a last line longer than maxLineBytes, and changes nothing", async () => {
    const text = `${line(1)}{"n":2,"pad":"${"z".repeat(5000)}`;
    await writeFile(path, text);
    await expect(healNdjsonTail(path, { maxLineBytes: 1024 })).rejects.toThrow(RangeError);
    expect(reads.bytes).toBeLessThanOrEqual(1024 + 2);
    expect(await readFile(path, "utf8")).toBe(text);
    // A bound of the exact length of the last line is enough
    const last = text.length - line(1).length;
    expect((await healNdjsonTail(path, { maxLineBytes: last })).action).toBe("truncated");
    expect(await readFile(path, "utf8")).toBe(line(1));
  });
});
