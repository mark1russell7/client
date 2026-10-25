/**
 * Hostile archives (roadmap R46, "zip slip"): entries with `..` or an absolute path, symbolic
 * links out of the target, entries through links, hard links, special files, archives over the
 * limits, a zip entry with more bytes than it declares, and links in the target folder.
 *
 * Each refusal must come before a write: the target stays empty, and nothing appears outside it.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Header } from "tar";
import { createRegistry, invokePath, outputValue, type ProcedureModule } from "@procedures/client";
import { archiveModule, createArchiveModule } from "./module.js";
import { planExtract } from "./paths.js";
import { writeZip, type ZipWriteEntry } from "./zip.js";
import type { ArchiveExtractOutput, ArchiveListOutput } from "./types.js";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A temporary folder with `target` (empty) inside it: an escape from `target` lands in `root`. */
function place(): { root: string; target: string } {
  const root = mkdtempSync(join(tmpdir(), "archive-hostile-"));
  folders.push(root);
  const target = join(root, "deep", "target");
  mkdirSync(target, { recursive: true });
  return { root, target };
}

const canSymlink = (() => {
  const folder = mkdtempSync(join(tmpdir(), "archive-link-"));
  try {
    writeFileSync(join(folder, "a"), "a");
    symlinkSync("a", join(folder, "b"));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
})();

function caller(module: ProcedureModule = archiveModule) {
  const registry = createRegistry(module);
  return async <T>(key: string, input: unknown): Promise<T> => {
    const path = key.split(".");
    return outputValue(await invokePath<T>(path, input, { registry }), path);
  };
}
const call = caller();

// =============================================================================
// Hostile tar archives, written header by header
// =============================================================================

interface TarSpec {
  path: string;
  type?: "File" | "Directory" | "SymbolicLink" | "Link" | "CharacterDevice" | "FIFO";
  data?: string;
  linkpath?: string;
  size?: number;
}

/** A tar.gz with the entries as given: no check, no normalization. */
function hostileTar(entries: TarSpec[], gzip = true): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? "");
    const header = new Header({
      path: entry.path,
      type: entry.type ?? "File",
      size: entry.size ?? data.length,
      mode: entry.type === "Directory" ? 0o755 : 0o644,
      mtime: new Date(0),
      uid: 0,
      gid: 0,
      ...(entry.linkpath !== undefined ? { linkpath: entry.linkpath } : {}),
    });
    header.encode();
    blocks.push(header.block!, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  const tar = Buffer.concat(blocks);
  return gzip ? gzipSync(tar) : tar;
}

/** A zip with the entries as given: no check of the names. */
async function hostileZip(file: string, entries: ZipWriteEntry[]): Promise<void> {
  const handle = await open(file, "wx");
  try {
    await writeZip(handle, entries);
  } finally {
    await handle.close();
  }
}

/** The names under a folder, and the names next to the target (an escape lands there). */
function nothingWritten(root: string, target: string): void {
  expect(readdirSync(target)).toEqual([]);
  expect(readdirSync(join(root, "deep"))).toEqual(["target"]);
  expect(readdirSync(root).sort()).toEqual(["archive", "deep"].filter((name) => existsSync(join(root, name))).sort());
}

async function refusedTar(entries: TarSpec[], code: string, entry?: string): Promise<void> {
  const { root, target } = place();
  const archive = join(root, "archive");
  writeFileSync(archive, hostileTar(entries));
  const expected: Record<string, unknown> = { code };
  if (entry !== undefined) expected["entry"] = entry;
  await expect(call("archive.extract", { archive, target })).rejects.toMatchObject(expected);
  nothingWritten(root, target);
}

describe("a hostile tar.gz", () => {
  it("with ../ is refused before a write: the good entry before it is not written either", async () => {
    await refusedTar([{ path: "good.txt", data: "ok" }, { path: "../../evil.txt", data: "pwned" }], "UNSAFE_PATH", "../../evil.txt");
    await refusedTar([{ path: "a/../../evil.txt", data: "pwned" }], "UNSAFE_PATH");
    await refusedTar([{ path: "..\\..\\evil.txt", data: "pwned" }], "UNSAFE_PATH");
  });

  it("with an absolute path, a drive letter or a UNC path is refused", async () => {
    await refusedTar([{ path: "/tmp/evil.txt", data: "pwned" }], "UNSAFE_PATH");
    await refusedTar([{ path: "C:\\evil.txt", data: "pwned" }], "UNSAFE_PATH");
    await refusedTar([{ path: "c:evil.txt", data: "pwned" }], "UNSAFE_PATH");
    await refusedTar([{ path: "\\\\server\\share\\evil.txt", data: "pwned" }], "UNSAFE_PATH");
  });

  it.each(["/etc", "C:\\Windows", "../..", "a/../../.."])("with a symbolic link to %s is refused", async (linkpath) => {
    await refusedTar([{ path: "link", type: "SymbolicLink", linkpath }], "UNSAFE_LINK", "link");
  });

  it("with a symbolic link in a folder to a path out of the target is refused", async () => {
    await refusedTar([{ path: "sub/link", type: "SymbolicLink", linkpath: "../../outside.txt" }], "UNSAFE_LINK", "sub/link");
  });

  it("with a symbolic link without a target is refused", async () => {
    await refusedTar([{ path: "link", type: "SymbolicLink", linkpath: "" }], "BAD_ARCHIVE");
  });

  it("with an entry through a link of the archive is refused: the link then the file", async () => {
    // The classic: a link to a folder outside, then a file "through" the link
    await refusedTar(
      [
        { path: "escape", type: "SymbolicLink", linkpath: "../.." },
        { path: "escape/evil.txt", data: "pwned" },
      ],
      "UNSAFE_LINK",
    );
    // A link that stays in the target is fine alone, but no entry may go through it
    await refusedTar(
      [
        { path: "here", type: "SymbolicLink", linkpath: "." },
        { path: "here/file.txt", data: "x" },
      ],
      "UNSAFE_PATH",
      "here/file.txt",
    );
  });

  it("with links that escape together is refused, in each order of the entries", async () => {
    // "here" stays in the target, and "up" goes through it: here/.. is the parent of the target
    const pair: TarSpec[] = [
      { path: "here", type: "SymbolicLink", linkpath: "." },
      { path: "up", type: "SymbolicLink", linkpath: "here/.." },
    ];
    await refusedTar(pair, "UNSAFE_LINK", "up");
    await refusedTar([pair[1]!, pair[0]!], "UNSAFE_LINK", "up");
    // A loop of links
    await refusedTar(
      [
        { path: "x", type: "SymbolicLink", linkpath: "y" },
        { path: "y", type: "SymbolicLink", linkpath: "x" },
      ],
      "UNSAFE_LINK",
    );
  });

  it("with a link and an entry that differ only in case is refused (a file system that ignores the case)", async () => {
    await refusedTar(
      [
        { path: "Here", type: "SymbolicLink", linkpath: "." },
        { path: "here/up", type: "SymbolicLink", linkpath: ".." },
      ],
      "UNSAFE_PATH",
      "here/up",
    );
  });

  it("with a link path that appears two times, or a file at the path of a link, is refused", async () => {
    await refusedTar(
      [
        { path: "a.txt", data: "x" },
        { path: "a.txt", type: "SymbolicLink", linkpath: "b.txt" },
      ],
      "UNSAFE_LINK",
    );
    await refusedTar(
      [
        { path: "l", type: "SymbolicLink", linkpath: "a" },
        { path: "l", type: "SymbolicLink", linkpath: "b" },
      ],
      "UNSAFE_LINK",
    );
  });

  it("with a hard link out of the archive is refused, and a hard link to an earlier file is extracted", async () => {
    await refusedTar([{ path: "h", type: "Link", linkpath: "../../etc/passwd" }], "UNSAFE_LINK");
    await refusedTar([{ path: "h", type: "Link", linkpath: "/etc/passwd" }], "UNSAFE_LINK");
    await refusedTar(
      [
        { path: "h", type: "Link", linkpath: "later.txt" },
        { path: "later.txt", data: "x" },
      ],
      "UNSAFE_LINK",
    );
    const { root, target } = place();
    const archive = join(root, "archive");
    writeFileSync(archive, hostileTar([{ path: "f.txt", data: "same" }, { path: "h.txt", type: "Link", linkpath: "f.txt" }]));
    expect(await call<ArchiveExtractOutput>("archive.extract", { archive, target })).toMatchObject({ files: 1, links: 1 });
    expect(readFileSync(join(target, "h.txt"), "utf8")).toBe("same");
  });

  it("with a device or a FIFO is refused", async () => {
    await refusedTar([{ path: "dev", type: "CharacterDevice" }], "UNSUPPORTED_ENTRY", "dev");
    await refusedTar([{ path: "fifo", type: "FIFO" }], "UNSUPPORTED_ENTRY");
  });

  it("over the limits is refused before a write, also when it lies about nothing", async () => {
    const small = caller(createArchiveModule({ maxBytes: 1000, maxEntries: 3 }));
    const { root, target } = place();
    const archive = join(root, "archive");
    writeFileSync(archive, hostileTar([{ path: "big.txt", data: "x".repeat(2000) }]));
    await expect(small("archive.extract", { archive, target })).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(small("archive.list", { archive })).resolves.toMatchObject({ bytes: 2000 });
    rmSync(archive);
    writeFileSync(archive, hostileTar([1, 2, 3, 4].map((n) => ({ path: `f${n}.txt`, data: "x" }))));
    await expect(small("archive.extract", { archive, target })).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(small("archive.list", { archive })).rejects.toMatchObject({ code: "TOO_LARGE" });
    nothingWritten(root, target);
  });

  it("that is damaged gives BAD_ARCHIVE", async () => {
    const { root, target } = place();
    const archive = join(root, "archive");
    const good = hostileTar([{ path: "a.txt", data: "x" }], false);
    good[148] = 0x31; // The checksum of the header
    writeFileSync(archive, gzipSync(good));
    await expect(call("archive.extract", { archive, target })).rejects.toMatchObject({ code: "BAD_ARCHIVE" });
  });

  it("lists the hostile entries as they are, without a write", async () => {
    const { root } = place();
    const archive = join(root, "archive");
    writeFileSync(archive, hostileTar([{ path: "../../evil.txt", data: "pwned" }, { path: "link", type: "SymbolicLink", linkpath: "/etc" }]));
    const listed = await call<ArchiveListOutput>("archive.list", { archive });
    expect(listed.entries.map((entry) => [entry.path, entry.kind, entry.linkTarget])).toEqual([
      ["../../evil.txt", "file", undefined],
      ["link", "symlink", "/etc"],
    ]);
  });
});

// =============================================================================
// Hostile zip archives
// =============================================================================

async function refusedZip(entries: ZipWriteEntry[], code: string): Promise<void> {
  const { root, target } = place();
  const archive = join(root, "archive");
  await hostileZip(archive, entries);
  await expect(call("archive.extract", { archive, target })).rejects.toMatchObject({ code });
  nothingWritten(root, target);
}

const file = (name: string, text = "pwned"): ZipWriteEntry => ({ name, kind: "file", data: Buffer.from(text) });
const link = (name: string, target: string): ZipWriteEntry => ({ name, kind: "symlink", data: Buffer.from(target) });

describe("a hostile zip", () => {
  it("with ../, a backslash path, an absolute path or a drive letter is refused before a write", async () => {
    await refusedZip([file("good.txt", "ok"), file("../../evil.txt")], "UNSAFE_PATH");
    await refusedZip([file("..\\..\\evil.txt")], "UNSAFE_PATH");
    await refusedZip([file("/tmp/evil.txt")], "UNSAFE_PATH");
    await refusedZip([file("C:/evil.txt")], "UNSAFE_PATH");
  });

  it("with a symbolic link entry out of the target, or a file through a link, is refused", async () => {
    await refusedZip([link("link", "/etc")], "UNSAFE_LINK");
    await refusedZip([link("link", "../../..")], "UNSAFE_LINK");
    await refusedZip([link("escape", ".."), file("escape/evil.txt")], "UNSAFE_LINK");
    await refusedZip([link("here", "."), file("here/x.txt", "x")], "UNSAFE_PATH");
  });

  it("with an entry that has more bytes than it declares (a zip bomb) stops, and leaves no part of the file", async () => {
    const { root, target } = place();
    const archive = join(root, "archive");
    await hostileZip(archive, [file("bomb.txt", "a".repeat(100_000))]);
    // The central directory and the local header say 100 bytes
    const bytes = readFileSync(archive);
    const central = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(100, central + 24);
    bytes.writeUInt32LE(100, 22);
    writeFileSync(archive, bytes);
    await expect(call("archive.extract", { archive, target })).rejects.toMatchObject({ code: "BAD_ARCHIVE", message: expect.stringContaining("more bytes") });
    expect(readdirSync(target)).toEqual([]);
  });

  it("with a wrong CRC-32 gives BAD_ARCHIVE", async () => {
    const { root, target } = place();
    const archive = join(root, "archive");
    await hostileZip(archive, [file("a.txt", "content")]);
    const bytes = readFileSync(archive);
    const central = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(0x12345678, central + 16);
    writeFileSync(archive, bytes);
    await expect(call("archive.extract", { archive, target })).rejects.toMatchObject({ code: "BAD_ARCHIVE", message: expect.stringContaining("CRC") });
    expect(readdirSync(target)).toEqual([]);
  });

  it("over the limit of bytes is refused by the declared sizes", async () => {
    const small = caller(createArchiveModule({ maxBytes: 10 }));
    const { root, target } = place();
    const archive = join(root, "archive");
    await hostileZip(archive, [file("a.txt", "0123456789abc")]);
    await expect(small("archive.extract", { archive, target })).rejects.toMatchObject({ code: "TOO_LARGE" });
    nothingWritten(root, target);
  });

  it("that is encrypted, uses another method, or has no central directory gives BAD_ARCHIVE", async () => {
    const { root, target } = place();
    const archive = join(root, "archive");
    await hostileZip(archive, [file("a.txt", "x")]);
    const bytes = readFileSync(archive);
    const central = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt16LE(0x0801, central + 8);
    writeFileSync(archive, bytes);
    await expect(call("archive.extract", { archive, target })).rejects.toMatchObject({ code: "BAD_ARCHIVE", message: expect.stringContaining("encrypted") });
    bytes.writeUInt16LE(0x0800, central + 8);
    bytes.writeUInt16LE(14, central + 10);
    writeFileSync(archive, bytes);
    await expect(call("archive.extract", { archive, target })).rejects.toMatchObject({ code: "BAD_ARCHIVE", message: expect.stringContaining("method 14") });
    writeFileSync(archive, bytes.subarray(0, central));
    await expect(call("archive.list", { archive })).rejects.toMatchObject({ code: "BAD_ARCHIVE" });
  });
});

describe("a zip64 archive", () => {
  it("is read: the sizes and the offset come from the zip64 field, the count from the zip64 end record", async () => {
    const { root, target } = place();
    const archive = join(root, "archive");
    const name = Buffer.from("z.txt");
    const data = Buffer.from("zip64!");
    const { crc32 } = await import("./zip.js");
    const crc = crc32(data);
    const extra = Buffer.alloc(4 + 24);
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(24, 2);
    extra.writeBigUInt64LE(BigInt(data.length), 4);
    extra.writeBigUInt64LE(BigInt(data.length), 12);
    extra.writeBigUInt64LE(0n, 20);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(45, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(0xffffffff, 18);
    local.writeUInt32LE(0xffffffff, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length - 8, 28);
    const localExtra = Buffer.alloc(20);
    localExtra.writeUInt16LE(0x0001, 0);
    localExtra.writeUInt16LE(16, 2);
    localExtra.writeBigUInt64LE(BigInt(data.length), 4);
    localExtra.writeBigUInt64LE(BigInt(data.length), 12);
    const localPart = Buffer.concat([local, name, localExtra, data]);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(45, 4);
    record.writeUInt16LE(45, 6);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(0xffffffff, 20);
    record.writeUInt32LE(0xffffffff, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt16LE(extra.length, 30);
    record.writeUInt32LE(0xffffffff, 42);
    const directory = Buffer.concat([record, name, extra]);
    const end64 = Buffer.alloc(56);
    end64.writeUInt32LE(0x06064b50, 0);
    end64.writeBigUInt64LE(44n, 4);
    end64.writeBigUInt64LE(1n, 24);
    end64.writeBigUInt64LE(1n, 32);
    end64.writeBigUInt64LE(BigInt(directory.length), 40);
    end64.writeBigUInt64LE(BigInt(localPart.length), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(localPart.length + directory.length), 8);
    locator.writeUInt32LE(1, 16);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0xffff, 8);
    end.writeUInt16LE(0xffff, 10);
    end.writeUInt32LE(0xffffffff, 12);
    end.writeUInt32LE(0xffffffff, 16);
    writeFileSync(archive, Buffer.concat([localPart, directory, end64, locator, end]));
    const listed = await call<ArchiveListOutput>("archive.list", { archive });
    expect(listed.entries).toMatchObject([{ path: "z.txt", kind: "file", size: 6 }]);
    await call("archive.extract", { archive, target });
    expect(readFileSync(join(target, "z.txt"), "utf8")).toBe("zip64!");
  });

  it("is not needed for 65535 entries: a count of 0xffff without a locator is the true count (audit pass 2)", async () => {
    const { root } = place();
    const archive = join(root, "many.zip");
    const entries: ZipWriteEntry[] = Array.from({ length: 0xffff }, (_, index) => ({ name: `d${index}`, kind: "directory" }));
    await hostileZip(archive, entries);
    const { readZipDirectory } = await import("./zip.js");
    const listed = await readZipDirectory(archive, 0x10000);
    expect(listed).toHaveLength(0xffff);
    expect(listed[0xfffe]).toMatchObject({ kind: "directory" });
  }, 30_000);
});

// =============================================================================
// The target folder
// =============================================================================

describe("the target folder", () => {
  it.skipIf(!canSymlink)("with a link to a folder outside is not a way out: the entry through it is refused", async () => {
    const { root, target } = place();
    const outside = join(root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(target, "door"), "dir");
    const archive = join(root, "archive");
    writeFileSync(archive, hostileTar([{ path: "door/evil.txt", data: "pwned" }]));
    await expect(call("archive.extract", { archive, target })).rejects.toMatchObject({ code: "UNSAFE_PATH" });
    expect(readdirSync(outside)).toEqual([]);
  });

  it.skipIf(!canSymlink)("with a link at the path of a file: overwrite replaces the link and does not write through it", async () => {
    const { root, target } = place();
    const secret = join(root, "secret.txt");
    writeFileSync(secret, "keep");
    symlinkSync(secret, join(target, "f.txt"));
    const archive = join(root, "archive");
    for (const format of ["tar", "zip"] as const) {
      rmSync(archive, { force: true });
      if (format === "tar") writeFileSync(archive, hostileTar([{ path: "f.txt", data: "new" }]));
      else await hostileZip(archive, [file("f.txt", "new")]);
      await expect(call("archive.extract", { archive, target })).rejects.toMatchObject({ code: "EXISTS" });
      await call("archive.extract", { archive, target, overwrite: true });
      expect(readFileSync(secret, "utf8")).toBe("keep");
      expect(readFileSync(join(target, "f.txt"), "utf8")).toBe("new");
      rmSync(join(target, "f.txt"));
      symlinkSync(secret, join(target, "f.txt"));
    }
  });

  it("with a file where the archive has a folder gives EXISTS", async () => {
    const { root, target } = place();
    writeFileSync(join(target, "sub"), "a file");
    const archive = join(root, "archive");
    writeFileSync(archive, hostileTar([{ path: "sub/a.txt", data: "x" }]));
    await expect(call("archive.extract", { archive, target, overwrite: true })).rejects.toMatchObject({ code: "EXISTS" });
    mkdirSync(join(target, "dir"));
    rmSync(archive);
    writeFileSync(archive, hostileTar([{ path: "dir", data: "x" }]));
    await expect(call("archive.extract", { archive, target, overwrite: true })).rejects.toMatchObject({ code: "EXISTS" });
  });
});

describe("planExtract", () => {
  it("skips the root folder entry and refuses a file without a name", () => {
    expect(planExtract([{ name: "./", kind: "directory", size: 0 }], tmpdir(), { overwrite: false, maxBytes: 10, maxEntries: 10 })).toEqual([]);
    expect(() => planExtract([{ name: "./", kind: "file", size: 0 }], tmpdir(), { overwrite: false, maxBytes: 10, maxEntries: 10 })).toThrow(/no name/);
  });
});
