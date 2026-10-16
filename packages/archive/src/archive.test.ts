/**
 * The archive procedures (roadmap R46) in temporary folders: make, list and extract tar.gz, tar
 * and zip archives, the formats, the limits and the errors of the inputs.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, effectsOf, invokePath, outputValue, type ProcedureModule } from "@procedures/client";
import { archiveModule, createArchiveModule, registerArchiveProcedures } from "./module.js";
import { crc32 } from "./zip.js";
import { portableLinkTarget } from "./walk.js";
import type { ArchiveCreateOutput, ArchiveExtractOutput, ArchiveListOutput } from "./types.js";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function temp(): string {
  const folder = mkdtempSync(join(tmpdir(), "archive-test-"));
  folders.push(folder);
  return folder;
}

/** True when this process can make a symbolic link (Windows needs a privilege or the developer mode). */
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

/** A folder with nested folders, an empty file, a binary file and a name with Unicode. */
function sampleFolder(): string {
  const folder = join(temp(), "source");
  mkdirSync(join(folder, "sub", "deeper"), { recursive: true });
  mkdirSync(join(folder, "empty-folder"));
  writeFileSync(join(folder, "a.txt"), "alpha\n");
  writeFileSync(join(folder, "empty.txt"), "");
  writeFileSync(join(folder, "sub", "b.bin"), Buffer.from([0, 1, 2, 250, 255]));
  writeFileSync(join(folder, "sub", "deeper", "ü-ß.txt"), "unicode");
  writeFileSync(join(folder, "sub", "big.txt"), "x".repeat(50_000));
  return folder;
}

/** Each file under a folder, with its content, by relative path. */
function contents(folder: string, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(join(folder, prefix), { withFileTypes: true })) {
    const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      result[`${name}/`] = "";
      Object.assign(result, contents(folder, name));
    } else {
      result[name] = readFileSync(join(folder, name)).toString("base64");
    }
  }
  return result;
}

const call = caller();

describe.each(["tar.gz", "tar", "zip"] as const)("a %s archive", (format) => {
  const extension = format === "tar.gz" ? "tgz" : format;

  it("makes the archive of a folder, lists it, and extracts the same content", async () => {
    const source = sampleFolder();
    const output = join(temp(), `out.${extension}`);
    const made = await call<ArchiveCreateOutput>("archive.create", { output, source });
    expect(made).toMatchObject({ path: output, format, entries: 8 });
    expect(made.bytes).toBeGreaterThan(0);

    const listed = await call<ArchiveListOutput>("archive.list", { archive: output });
    expect(listed.format).toBe(format);
    // The walk is depth first, with the names of each folder sorted
    expect(listed.entries.map((entry) => entry.path.replace(/\/$/, ""))).toEqual([
      "a.txt",
      "empty-folder",
      "empty.txt",
      "sub",
      "sub/b.bin",
      "sub/big.txt",
      "sub/deeper",
      "sub/deeper/ü-ß.txt",
    ]);
    expect(listed.entries.find((entry) => entry.path === "sub/big.txt")).toMatchObject({ kind: "file", size: 50_000 });
    expect(listed.entries.filter((entry) => entry.kind === "directory").length).toBe(3);
    expect(listed.bytes).toBe(6 + 0 + 5 + 50_000 + 7);

    const target = join(temp(), "target");
    const extracted = await call<ArchiveExtractOutput>("archive.extract", { archive: output, target });
    expect(extracted).toMatchObject({ format, files: 5, directories: 3, links: 0, bytes: 50_018 });
    expect(contents(target)).toEqual(contents(source));
  });

  it("makes the archive of named files and folders, relative to cwd", async () => {
    const source = sampleFolder();
    const output = join(temp(), `named.${extension}`);
    const made = await call<ArchiveCreateOutput>("archive.create", { output, cwd: source, files: ["a.txt", "sub/deeper", "./sub/b.bin"] });
    expect(made.entries).toBe(4);
    const listed = await call<ArchiveListOutput>("archive.list", { archive: output });
    expect(listed.entries.map((entry) => entry.path.replace(/\/$/, ""))).toEqual(["a.txt", "sub/deeper", "sub/deeper/ü-ß.txt", "sub/b.bin"]);
    const target = join(temp(), "target");
    await call("archive.extract", { archive: output, target });
    expect(readFileSync(join(target, "sub", "deeper", "ü-ß.txt"), "utf8")).toBe("unicode");
  });

  it("leaves the new archive out of the walk when it is in the source", async () => {
    const source = sampleFolder();
    const output = join(source, `self.${extension}`);
    const made = await call<ArchiveCreateOutput>("archive.create", { output, source });
    expect(made.entries).toBe(8);
    const listed = await call<ArchiveListOutput>("archive.list", { archive: output });
    expect(listed.entries.some((entry) => entry.path.startsWith("self."))).toBe(false);
  });

  it("makes and extracts the archive of an empty folder", async () => {
    const source = join(temp(), "nothing");
    mkdirSync(source);
    const output = join(temp(), `empty.${extension}`);
    expect(await call<ArchiveCreateOutput>("archive.create", { output, source })).toMatchObject({ entries: 0 });
    expect(await call<ArchiveListOutput>("archive.list", { archive: output })).toEqual({ format, entries: [], bytes: 0 });
    expect(await call<ArchiveExtractOutput>("archive.extract", { archive: output, target: join(temp(), "t") })).toMatchObject({ files: 0, directories: 0 });
  });

  it("refuses to replace an existing file without overwrite, and changes nothing", async () => {
    const source = sampleFolder();
    const output = join(temp(), `out.${extension}`);
    await call("archive.create", { output, source });
    const target = join(temp(), "target");
    mkdirSync(join(target, "sub"), { recursive: true });
    writeFileSync(join(target, "sub", "big.txt"), "mine");
    await expect(call("archive.extract", { archive: output, target })).rejects.toMatchObject({ code: "EXISTS", entry: "sub/big.txt" });
    // The check comes before each write: a.txt, which is before big.txt in the archive, is not there
    expect(existsSync(join(target, "a.txt"))).toBe(false);
    expect(readFileSync(join(target, "sub", "big.txt"), "utf8")).toBe("mine");
    await call("archive.extract", { archive: output, target, overwrite: true });
    expect(readFileSync(join(target, "sub", "big.txt"), "utf8")).toBe("x".repeat(50_000));
  });

  it.skipIf(!canSymlink)("keeps a link that stays in the folder", async () => {
    const source = sampleFolder();
    symlinkSync("../a.txt", join(source, "sub", "link-to-a"));
    const output = join(temp(), `links.${extension}`);
    await call("archive.create", { output, source });
    const listed = await call<ArchiveListOutput>("archive.list", { archive: output });
    expect(listed.entries.find((entry) => entry.path === "sub/link-to-a")).toMatchObject({ kind: "symlink", linkTarget: "../a.txt" });
    const target = join(temp(), "target");
    const extracted = await call<ArchiveExtractOutput>("archive.extract", { archive: output, target });
    expect(extracted.links).toBe(1);
    expect(readFileSync(join(target, "sub", "link-to-a"), "utf8")).toBe("alpha\n");
  });
});

describe("the link targets of the walk", () => {
  it("gives a link target with / on Windows, and keeps a \\ elsewhere", () => {
    expect(portableLinkTarget("..\\sub\\a.txt", "\\")).toBe("../sub/a.txt");
    expect(portableLinkTarget("../a\\b.txt", "/")).toBe("../a\\b.txt");
  });
});

describe("archive.create", () => {
  it("refuses an existing archive without overwrite, and replaces it with overwrite", async () => {
    const source = sampleFolder();
    const output = join(temp(), "out.zip");
    writeFileSync(output, "old");
    await expect(call("archive.create", { output, source })).rejects.toMatchObject({ code: "EXISTS" });
    expect(readFileSync(output, "utf8")).toBe("old");
    await call("archive.create", { output, source, overwrite: true });
    expect((await call<ArchiveListOutput>("archive.list", { archive: output })).entries.length).toBe(8);
    // No temporary file stays next to the archive
    expect(readdirSync(join(output, "..")).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("needs a known format, and exactly one of source and files", async () => {
    const source = sampleFolder();
    const folder = temp();
    await expect(call("archive.create", { output: join(folder, "x.rar"), source })).rejects.toMatchObject({ code: "BAD_FORMAT" });
    expect(await call<ArchiveCreateOutput>("archive.create", { output: join(folder, "x.rar"), source, format: "zip" })).toMatchObject({ format: "zip" });
    await expect(call("archive.create", { output: join(folder, "y.zip") })).rejects.toMatchObject({ code: "UNSAFE_PATH" });
    await expect(call("archive.create", { output: join(folder, "y.zip"), source, files: ["a.txt"], cwd: source })).rejects.toMatchObject({ code: "UNSAFE_PATH" });
    await expect(call("archive.create", { output: join(folder, "y.zip"), source: join(source, "a.txt") })).rejects.toMatchObject({ code: "UNSAFE_PATH" });
  });

  it("refuses a file name with .., an absolute name and a missing file", async () => {
    const source = sampleFolder();
    const output = join(temp(), "y.zip");
    for (const name of ["../a.txt", "sub/../../a.txt", "/etc/passwd", "C:\\Windows", "."]) {
      await expect(call("archive.create", { output, cwd: source, files: [name] }), name).rejects.toMatchObject({ code: "UNSAFE_PATH" });
    }
    await expect(call("archive.create", { output, cwd: source, files: ["missing.txt"] })).rejects.toMatchObject({ code: "UNSAFE_PATH" });
    expect(existsSync(output)).toBe(false);
  });

  it("obeys the limits of the module", async () => {
    const source = sampleFolder();
    const small = caller(createArchiveModule({ maxEntries: 3 }));
    await expect(small("archive.create", { output: join(temp(), "a.zip"), source })).rejects.toMatchObject({ code: "TOO_LARGE" });
    const few = caller(createArchiveModule({ maxBytes: 100 }));
    await expect(few("archive.create", { output: join(temp(), "a.tgz"), source })).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(() => createArchiveModule({ maxBytes: -1 })).toThrow(/maxBytes/);
  });
});

describe("archive.list and the formats", () => {
  it("finds the format from the first bytes, and refuses a format that does not agree", async () => {
    const source = sampleFolder();
    const folder = temp();
    const zip = join(folder, "a.zip");
    await call("archive.create", { output: zip, source });
    const renamed = join(folder, "a.data");
    writeFileSync(renamed, readFileSync(zip));
    expect((await call<ArchiveListOutput>("archive.list", { archive: renamed })).format).toBe("zip");
    await expect(call("archive.list", { archive: zip, format: "tar.gz" })).rejects.toMatchObject({ code: "BAD_FORMAT" });
    const text = join(folder, "text.txt");
    writeFileSync(text, "not an archive");
    await expect(call("archive.list", { archive: text })).rejects.toMatchObject({ code: "BAD_FORMAT" });
    await expect(call("archive.extract", { archive: text, target: join(folder, "t") })).rejects.toMatchObject({ code: "BAD_FORMAT" });
  });

  it("gives the mode and the time of an entry", async () => {
    const source = sampleFolder();
    const output = join(temp(), "a.tgz");
    await call("archive.create", { output, source });
    const entry = (await call<ArchiveListOutput>("archive.list", { archive: output })).entries.find((each) => each.path === "a.txt")!;
    expect(typeof entry.mode).toBe("number");
    expect(Number.isNaN(Date.parse(entry.mtime!))).toBe(false);
  });
});

describe("the module", () => {
  it("declares the effects: create and extract read and write fs, list only reads", () => {
    expect(archiveModule.procedures.map((procedure) => procedure.path.join("."))).toEqual(["archive.create", "archive.extract", "archive.list"]);
    const [create, extract, list] = archiveModule.procedures;
    expect(effectsOf(create!)).toEqual({ reads: ["fs"], writes: ["fs"] });
    expect(effectsOf(extract!)).toEqual({ reads: ["fs"], writes: ["fs"] });
    expect(effectsOf(list!)).toEqual({ reads: ["fs"], writes: [] });
    expect(createArchiveModule()).toBe(archiveModule);
  });

  it("registers the procedures with the limits of the options", async () => {
    const registry = createRegistry();
    registerArchiveProcedures(registry, { maxEntries: 1 });
    const source = sampleFolder();
    await expect(invokePath(["archive", "create"], { output: join(temp(), "a.zip"), source }, { registry })).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("computes the CRC-32 of the standard check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.from("6789"), crc32(Buffer.from("12345")))).toBe(0xcbf43926);
  });
});
