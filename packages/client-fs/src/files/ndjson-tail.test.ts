/**
 * healNdjsonTail and healNdjsonTailSync (roadmap O51 and O52): each state of the end of a file,
 * the last line, the error of a long line, and a large file, where the function reads only the
 * tail. Wrappers of `open` and `readSync` count the bytes that each form reads.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as fsSync from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  healNdjsonTail,
  healNdjsonTailSync,
  NDJSON_LINE_TOO_LONG,
  type HealNdjsonTailOptions,
  type NdjsonTailResult,
} from "./ndjson-tail.js";

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

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fsSync>();
  return {
    ...actual,
    readSync: (...args: Parameters<typeof actual.readSync>): number => {
      const bytesRead = actual.readSync(...args);
      reads.bytes += bytesRead;
      return bytesRead;
    },
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      reads.wholeFile++;
      return actual.readFileSync(...args);
    },
  };
});

const { readFile, writeFile, mkdtemp, rm, stat } = fsPromises;

type Heal = (path: string, options?: HealNdjsonTailOptions) => Promise<NdjsonTailResult>;

/** The two forms. The sync form runs in a promise, so a throw is a rejection. */
const forms: [string, Heal][] = [
  ["healNdjsonTail", healNdjsonTail],
  ["healNdjsonTailSync", (path, options) => Promise.resolve().then(() => healNdjsonTailSync(path, options))],
];

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

const record = (n: number, pad = ""): string => JSON.stringify({ n, pad });
const line = (n: number, pad = ""): string => `${record(n, pad)}\n`;

/** The text of the error of a long line. */
const tooLong = (lineBytes: number, maxLineBytes: number): string =>
  `A line at the end of ${path} has ${lineBytes} bytes, more than the limit maxLineBytes (${maxLineBytes} bytes). ` +
  `Set the option maxLineBytes to ${lineBytes} or more, or to Infinity for no limit. The file did not change.`;

describe.each(forms)("%s", (_name, heal) => {
  it("does nothing for a file that does not exist, and does not make it", async () => {
    expect(await heal(path)).toEqual({ action: "none", bytes: 0, size: 0 });
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does nothing for an empty file", async () => {
    await writeFile(path, "");
    expect(await heal(path)).toEqual({ action: "none", bytes: 0, size: 0 });
    expect(await readFile(path, "utf8")).toBe("");
  });

  it("does nothing for a file that ends in a newline, and reads one byte", async () => {
    const good = line(1) + line(2);
    await writeFile(path, good);
    const result = await heal(path);
    expect(result).toEqual({ action: "none", bytes: 0, size: Buffer.byteLength(good) });
    expect("lastLine" in result).toBe(false);
    expect(await readFile(path, "utf8")).toBe(good);
    expect(reads.bytes).toBe(1);
  });

  it("cuts off a partial last line", async () => {
    const good = line(1) + line(2);
    const torn = '{"n":3,"pad":"ab';
    await writeFile(path, good + torn);
    expect(await heal(path)).toEqual({ action: "truncated", bytes: torn.length, size: good.length });
    expect(await readFile(path, "utf8")).toBe(good);
  });

  it("cuts a file of one partial line to empty", async () => {
    await writeFile(path, '{"n":1');
    expect(await heal(path)).toEqual({ action: "truncated", bytes: 6, size: 0 });
    expect(await readFile(path, "utf8")).toBe("");
  });

  it("adds the newline to a complete last record, and keeps the record", async () => {
    const good = line(1);
    const whole = JSON.stringify({ n: 2, text: "ünï" });
    await writeFile(path, good + whole);
    const size = Buffer.byteLength(good + whole);
    expect(await heal(path)).toEqual({ action: "newline", bytes: 1, size: size + 1 });
    expect(await readFile(path, "utf8")).toBe(`${good + whole}\n`);
  });

  it("keeps a complete only record, also after a byte order mark", async () => {
    await writeFile(path, `﻿${JSON.stringify({ n: 1 })}`);
    expect((await heal(path)).action).toBe("newline");
    expect(await readFile(path, "utf8")).toBe(`﻿${JSON.stringify({ n: 1 })}\n`);
  });

  it("keeps a complete record of a CRLF file, and cuts a line of spaces", async () => {
    await writeFile(path, `{"n":1}\r\n{"n":2}\r`);
    expect((await heal(path)).action).toBe("newline");
    expect(await readFile(path, "utf8")).toBe(`{"n":1}\r\n{"n":2}\r\n`);
    await writeFile(path, `{"n":1}\n   `);
    expect((await heal(path)).action).toBe("truncated");
    expect(await readFile(path, "utf8")).toBe(`{"n":1}\n`);
  });

  it("finds the start of a partial line that is longer than one read", async () => {
    const good = line(1);
    const torn = `{"n":2,"pad":"${"y".repeat(200 * 1024)}`;
    await writeFile(path, good + torn);
    expect(await heal(path)).toEqual({ action: "truncated", bytes: torn.length, size: good.length });
    expect(await readFile(path, "utf8")).toBe(good);
  });

  it("reads only the tail of a large file, never the whole file", async () => {
    const lines: string[] = [];
    for (let n = 0; n < 4096; n++) lines.push(line(n, "x".repeat(1000)));
    const good = lines.join("");
    const torn = '{"n":4096,"pad":"xx';
    await writeFile(path, good + torn);
    reads.bytes = 0;
    const result = await heal(path);
    expect(result).toEqual({ action: "truncated", bytes: torn.length, size: good.length });
    expect(good.length).toBeGreaterThan(4_000_000);
    // One byte, then one chunk of 64 KiB at most
    expect(reads.bytes).toBeLessThanOrEqual(64 * 1024 + 1);
    expect(reads.wholeFile).toBe(0);
    const healed = await readFile(path, "utf8");
    expect(healed.length).toBe(good.length);
    expect(healed.endsWith(lines.at(-1)!)).toBe(true);
    // The last line of the healed file comes from the tail too
    reads.bytes = 0;
    expect((await heal(path, { lastLine: true })).lastLine).toBe(record(4095, "x".repeat(1000)));
    expect(reads.bytes).toBeLessThanOrEqual(64 * 1024 + 1);
    expect(reads.wholeFile).toBe(0);
  });

  it("makes the same repairs without a flush (fsync: false)", async () => {
    await writeFile(path, `${line(1)}{"n":2`);
    expect((await heal(path, { fsync: false })).action).toBe("truncated");
    await writeFile(path, `${line(1)}{"n":2}`);
    expect((await heal(path, { fsync: false })).action).toBe("newline");
    expect(await readFile(path, "utf8")).toBe(`${line(1)}{"n":2}\n`);
  });

  // Windows opens a folder for a write, so only the other platforms give EISDIR
  it.skipIf(process.platform === "win32")("throws an error of the open other than a missing file", async () => {
    await fsPromises.mkdir(join(folder, "dir"));
    await expect(heal(join(folder, "dir"))).rejects.toMatchObject({ code: "EISDIR" });
  });
});

describe.each(forms)("%s and lastLine", (_name, heal) => {
  const last = { lastLine: true } as const;

  it("gives no last line for a missing file and for an empty file", async () => {
    expect(await heal(path, last)).toStrictEqual({ action: "none", bytes: 0, size: 0, lastLine: undefined });
    await writeFile(path, "");
    expect(await heal(path, last)).toStrictEqual({ action: "none", bytes: 0, size: 0, lastLine: undefined });
  });

  it("gives the last record of a file that ends in a newline", async () => {
    const good = line(1) + line(2, "ünï");
    await writeFile(path, good);
    expect(await heal(path, last)).toStrictEqual({ action: "none", bytes: 0, size: Buffer.byteLength(good), lastLine: record(2, "ünï") });
    expect(await readFile(path, "utf8")).toBe(good);
  });

  it("gives the record before the cut of a partial line", async () => {
    const good = line(1) + line(2);
    await writeFile(path, `${good}{"n":3`);
    expect(await heal(path, last)).toStrictEqual({ action: "truncated", bytes: 6, size: good.length, lastLine: record(2) });
    expect(await readFile(path, "utf8")).toBe(good);
  });

  it("gives no last line after the cut of the only line", async () => {
    await writeFile(path, '{"n":1');
    expect(await heal(path, last)).toStrictEqual({ action: "truncated", bytes: 6, size: 0, lastLine: undefined });
  });

  it("gives the record that gets its newline", async () => {
    await writeFile(path, line(1) + record(2));
    expect(await heal(path, last)).toMatchObject({ action: "newline", bytes: 1, lastLine: record(2) });
    expect(await readFile(path, "utf8")).toBe(line(1) + line(2));
  });

  it("removes the \\r of a CRLF line and the byte order mark of the first line", async () => {
    await writeFile(path, `﻿{"n":1}\r\n`);
    expect((await heal(path, last)).lastLine).toBe('{"n":1}');
    await writeFile(path, `﻿{"n":1}`);
    expect(await heal(path, last)).toMatchObject({ action: "newline", lastLine: '{"n":1}' });
    await writeFile(path, `{"n":1}\r\n{"n":2}\r\n{"n":3`);
    expect(await heal(path, last)).toMatchObject({ action: "truncated", lastLine: '{"n":2}' });
  });

  it("gives an empty string for an empty last line", async () => {
    await writeFile(path, "\n");
    expect((await heal(path, last)).lastLine).toBe("");
    await writeFile(path, `${line(1)}\n{"n":2`);
    expect(await heal(path, last)).toMatchObject({ action: "truncated", lastLine: "" });
  });

  it("refuses a complete last line longer than maxLineBytes, and changes nothing", async () => {
    const long = record(1, "z".repeat(3000));
    await writeFile(path, `${line(0)}${long}\n`);
    const error = await heal(path, { lastLine: true, maxLineBytes: 1024 }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: NDJSON_LINE_TOO_LONG, lineBytes: long.length, maxLineBytes: 1024 });
    expect((error as Error).message).toBe(tooLong(long.length, 1024));
    // Without lastLine, the function reads one byte and gives no error
    expect((await heal(path, { maxLineBytes: 1024 })).action).toBe("none");
  });

  it("reads the record before a cut first, so its error cuts nothing", async () => {
    const long = record(1, "z".repeat(3000));
    const text = `${long}\n{"n":2`;
    await writeFile(path, text);
    await expect(heal(path, { lastLine: true, maxLineBytes: 1024 })).rejects.toMatchObject({ code: NDJSON_LINE_TOO_LONG });
    expect(await readFile(path, "utf8")).toBe(text);
    expect(await heal(path, { lastLine: true, maxLineBytes: Infinity })).toMatchObject({ action: "truncated", lastLine: long });
  });
});

describe.each(forms)("%s and maxLineBytes", (_name, heal) => {
  it("refuses a last line longer than maxLineBytes, names the length, and changes nothing", async () => {
    const text = `${line(1)}{"n":2,"pad":"${"z".repeat(5000)}`;
    const last = text.length - line(1).length;
    await writeFile(path, text);
    const error = await heal(path, { maxLineBytes: 1024 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toMatchObject({ code: "ERR_NDJSON_LINE_TOO_LONG", path, lineBytes: last, maxLineBytes: 1024 });
    expect((error as Error).message).toBe(tooLong(last, 1024));
    expect(reads.bytes).toBeLessThanOrEqual(text.length + 1);
    expect(await readFile(path, "utf8")).toBe(text);
    // A bound of the exact length of the last line is enough
    expect((await heal(path, { maxLineBytes: last })).action).toBe("truncated");
    expect(await readFile(path, "utf8")).toBe(line(1));
  });

  it("names the length of a line that starts the file and is longer than one read", async () => {
    const text = `{"pad":"${"z".repeat(200 * 1024)}`;
    await writeFile(path, text);
    await expect(heal(path, { maxLineBytes: 1024 })).rejects.toMatchObject({ code: NDJSON_LINE_TOO_LONG, lineBytes: text.length });
    expect(await readFile(path, "utf8")).toBe(text);
  });

  it("has no limit with Infinity", async () => {
    const torn = `{"n":2,"pad":"${"z".repeat(200 * 1024)}`;
    await writeFile(path, line(1) + torn);
    expect(await heal(path, { maxLineBytes: Infinity })).toEqual({ action: "truncated", bytes: torn.length, size: line(1).length });
    await writeFile(path, `${line(1)}${record(2, "z".repeat(200 * 1024))}`);
    expect(await heal(path, { maxLineBytes: Infinity, lastLine: true })).toMatchObject({
      action: "newline",
      lastLine: record(2, "z".repeat(200 * 1024)),
    });
  });

  it("refuses a line of the default limit of 16 MiB", { timeout: 30_000 }, async () => {
    const max = 16 * 1024 * 1024;
    const text = `${line(1)}{"pad":"${"z".repeat(max)}`;
    await writeFile(path, text);
    const last = text.length - line(1).length;
    await expect(heal(path)).rejects.toMatchObject({ code: NDJSON_LINE_TOO_LONG, lineBytes: last, maxLineBytes: max });
  });
});
