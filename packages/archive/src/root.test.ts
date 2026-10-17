/**
 * The root of the archive procedures (roadmap R33): `createArchiveModule({ root })` confines the
 * archive path, the source, `cwd`, the files and the target of each input to the root, with the
 * rules of `createFsModule({ root })`. A relative path starts at the root. `..`, an absolute path
 * outside the root, another drive and a symlink (or a junction) that leads out are refused with
 * `FORBIDDEN` and the reason `outside-root`. The tests use real temporary folders.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, relative, sep } from "node:path";
import { createRegistry, defineModule, InvocationError, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { archiveModule, createArchiveModule, registerArchiveProcedures } from "./module.js";
import { isInside, isOutsideRoot, OUTSIDE_ROOT, outsideRoot, realPathOf, resolveRoot } from "./root.js";
import { writeZip } from "./zip.js";
import type { ArchiveCreateOutput, ArchiveExtractOutput, ArchiveListOutput } from "./types.js";

const WINDOWS = process.platform === "win32";

/** A link to a folder: a junction on Windows (no privilege needed), a symlink elsewhere. */
function linkFolder(target: string, path: string): void {
  symlinkSync(target, path, WINDOWS ? "junction" : "dir");
}

/** True when this process can make a symlink to a file (Windows needs a privilege for it). */
const FILE_LINKS = (() => {
  const probe = mkdtempSync(join(tmpdir(), "archive-root-probe-"));
  try {
    writeFileSync(join(probe, "target"), "");
    symlinkSync(join(probe, "target"), join(probe, "link"), "file");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

let base: string;
let root: string;
let outside: string;
let registry: ProcedureRegistry;
const plain = createRegistry(archiveModule);

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = registry): Promise<T> {
  const path = key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry: at }), path);
}

/** The error of a call that the root refuses. */
async function refusal(key: string, input: unknown, at: ProcedureRegistry = registry): Promise<InvocationError> {
  const error: unknown = await call(key, input, at).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, `${key} ${JSON.stringify(input)}`).toBeInstanceOf(InvocationError);
  expect(error).toMatchObject({ code: "FORBIDDEN", reason: OUTSIDE_ROOT, path: key.split(".") });
  expect(isOutsideRoot(error)).toBe(true);
  return error as InvocationError;
}

beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), "archive-root-"));
  root = join(base, "root");
  outside = join(base, "outside");
  mkdirSync(join(root, "sub"), { recursive: true });
  mkdirSync(join(outside, "folder"), { recursive: true });
  // A sibling whose name starts with the name of the root
  mkdirSync(join(base, "root2"));
  writeFileSync(join(root, "a.txt"), "alpha");
  writeFileSync(join(root, "sub", "b.txt"), "beta");
  writeFileSync(join(outside, "secret.txt"), "secret");
  writeFileSync(join(outside, "folder", "c.txt"), "gamma");
  // An archive in the root, and one outside it, made by the module without a root
  await call("archive.create", { output: join(root, "in.zip"), source: join(root, "sub") }, plain);
  await call("archive.create", { output: join(outside, "out.zip"), source: join(outside, "folder") }, plain);
  await call("archive.create", { output: join(base, "root2", "near.zip"), source: join(outside, "folder") }, plain);
  registry = createRegistry(createArchiveModule({ root }));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

/** The names in the folder outside the root: no call writes there. */
const outsideNames = (): string[] => readdirSync(outside).sort();

/** Each input of a procedure with a path that `path` replaces: the archive path, the source, cwd, the files and the target. */
function inputsWith(path: string): Array<[string, Record<string, unknown>]> {
  return [
    ["archive.list", { archive: path }],
    ["archive.extract", { archive: path, target: "x" }],
    ["archive.extract", { archive: "in.zip", target: path }],
    ["archive.create", { output: path, source: "sub" }],
    ["archive.create", { output: "new.zip", source: path }],
    ["archive.create", { output: "new.zip", files: ["a.txt"], cwd: path }],
  ];
}

describe("createArchiveModule with a root", () => {
  it("gives archiveModule without a root or limits, and the same procedures with a root", () => {
    expect(createArchiveModule()).toBe(archiveModule);
    expect(createArchiveModule({ root: undefined })).toBe(archiveModule);
    const rooted = createArchiveModule({ root });
    expect(rooted.name).toBe(archiveModule.name);
    expect(rooted.procedures.map((procedure) => procedure.path)).toEqual(archiveModule.procedures.map((procedure) => procedure.path));
    expect(rooted.procedures.map((procedure) => procedure.metadata)).toEqual(archiveModule.procedures.map((procedure) => procedure.metadata));
    expect(() => createArchiveModule({ root: "" })).toThrow(TypeError);
    expect(() => createArchiveModule({ root: 5 as never })).toThrow(TypeError);
  });

  it("keeps the behaviour without a root: a path outside any folder works, and files start at the working folder", async () => {
    const listed = await call<ArchiveListOutput>("archive.list", { archive: join(outside, "out.zip") }, plain);
    expect(listed.entries.map((entry) => entry.path)).toEqual(["c.txt"]);
    // The working folder of the tests is the folder of the package
    const made = await call<ArchiveCreateOutput>("archive.create", { output: join(outside, "package.zip"), files: ["package.json"] }, plain);
    expect(made.entries).toBe(1);
    rmSync(join(outside, "package.zip"));
  });

  it("replaces the archiveModule that another module requires, when it comes first, and registerArchiveProcedures takes the root", async () => {
    const bundle = defineModule("bundle-that-requires-archive", [], [archiveModule]);
    const host = createRegistry(createArchiveModule({ root }), bundle);
    await refusal("archive.list", { archive: join(outside, "out.zip") }, host);
    const registered = createRegistry();
    registerArchiveProcedures(registered, { root });
    await refusal("archive.list", { archive: "../outside/out.zip" }, registered);
    expect((await call<ArchiveListOutput>("archive.list", { archive: "in.zip" }, registered)).entries).toHaveLength(1);
  });

  it("fails each call when the root does not exist", async () => {
    const missing = createRegistry(createArchiveModule({ root: join(base, "missing") }));
    await expect(call("archive.list", { archive: "in.zip" }, missing)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(call("archive.list", { archive: "in.zip" }, missing)).rejects.toThrow("The root of the archive procedures does not exist");
  });
});

describe("paths in the root", () => {
  it("resolves a relative archive, source, cwd and target against the root, and gives absolute paths", async () => {
    const made = await call<ArchiveCreateOutput>("archive.create", { output: "made.tgz", source: "sub" });
    expect(made.path).toBe(join(root, "made.tgz"));
    const files = await call<ArchiveCreateOutput>("archive.create", { output: "files.zip", files: ["a.txt", "sub/b.txt"] });
    expect(files).toMatchObject({ path: join(root, "files.zip"), entries: 2 });
    const named = await call<ArchiveCreateOutput>("archive.create", { output: "sub/named.zip", files: ["b.txt"], cwd: "sub" });
    expect(named.entries).toBe(1);
    expect((await call<ArchiveListOutput>("archive.list", { archive: "files.zip" })).entries.map((entry) => entry.path)).toEqual(["a.txt", "sub/b.txt"]);
    const extracted = await call<ArchiveExtractOutput>("archive.extract", { archive: "made.tgz", target: "out/made" });
    expect(extracted).toMatchObject({ files: 1 });
    // The target is a real path: on Windows, a short 8.3 name of the temporary folder (RUNNER~1) becomes its long name
    expect(isInside(await realpath(root), extracted.target)).toBe(true);
    expect(extracted.target).toBe(join(await realpath(root), "out", "made"));
    expect(existsSync(join(root, "out", "made", "b.txt"))).toBe(true);
  });

  it("accepts an absolute path in the root, and a .. that stays in the root", async () => {
    expect((await call<ArchiveListOutput>("archive.list", { archive: join(root, "in.zip") })).entries).toHaveLength(1);
    expect((await call<ArchiveListOutput>("archive.list", { archive: "sub/../in.zip" })).entries).toHaveLength(1);
    await call("archive.extract", { archive: "in.zip", target: join(root, "sub", "..", "abs") });
    expect(existsSync(join(root, "abs", "b.txt"))).toBe(true);
  });

  it("keeps the checks of the entries in the target: a zip slip in the root is refused before a write", async () => {
    const handle = await open(join(root, "slip.zip"), "wx");
    try {
      await writeZip(handle, [
        { name: "good.txt", kind: "file", mode: 0o644, mtime: new Date(0), data: Buffer.from("good") },
        { name: "../escape.txt", kind: "file", mode: 0o644, mtime: new Date(0), data: Buffer.from("bad") },
      ]);
    } finally {
      await handle.close();
    }
    await expect(call("archive.extract", { archive: "slip.zip", target: "t" })).rejects.toMatchObject({ code: "UNSAFE_PATH", entry: "../escape.txt" });
    expect(existsSync(join(root, "escape.txt"))).toBe(false);
    expect(readdirSync(join(root, "t"))).toEqual([]);
  });
});

describe("paths outside the root", () => {
  it("refuses .. out of the root for the archive path and for the target, and writes nothing outside", async () => {
    for (const [key, input] of inputsWith("../outside/out.zip")) {
      const error = await refusal(key, input);
      expect(error.message).toContain("is outside the root");
    }
    await refusal("archive.extract", { archive: "in.zip", target: "../outside/new" });
    // A name of files with .. is refused before the root, as without a root
    await expect(call("archive.create", { output: "new.zip", files: ["../outside/secret.txt"] })).rejects.toMatchObject({ code: "UNSAFE_PATH" });
    expect(outsideNames()).toEqual(["folder", "out.zip", "secret.txt"]);
    expect(existsSync(join(root, "x"))).toBe(false);
    expect(existsSync(join(root, "new.zip"))).toBe(false);
  });

  it("refuses an absolute path outside the root for the archive path and for the target", async () => {
    for (const [key, input] of inputsWith(join(outside, "out.zip"))) await refusal(key, input);
    for (const [key, input] of inputsWith(join(outside, "new", "deeper"))) await refusal(key, input);
    await refusal("archive.extract", { archive: "in.zip", target: outside });
    expect(outsideNames()).toEqual(["folder", "out.zip", "secret.txt"]);
  });

  it("refuses the parent of the root, and a sibling whose name starts with the name of the root", async () => {
    await refusal("archive.extract", { archive: "in.zip", target: ".." });
    await refusal("archive.create", { output: "all.zip", source: ".." });
    await refusal("archive.list", { archive: join(base, "root2", "near.zip") });
    await refusal("archive.list", { archive: "../root2/near.zip" });
    await refusal("archive.extract", { archive: "in.zip", target: join(base, "root2", "x") });
    expect(readdirSync(join(base, "root2"))).toEqual(["near.zip"]);
  });

  it("refuses another drive on Windows, and another case on POSIX", async () => {
    if (WINDOWS) {
      const drive = parse(root).root[0]!.toUpperCase();
      const other = drive === "Z" ? "Y" : "Z";
      await refusal("archive.list", { archive: `${other}:\\out.zip` });
      await refusal("archive.list", { archive: `${other}:out.zip` });
      await refusal("archive.extract", { archive: "in.zip", target: `${other}:\\target` });
      await refusal("archive.create", { output: `${other}:\\new.zip`, source: "sub" });
      await refusal("archive.list", { archive: "..\\outside\\out.zip" });
      // NTFS ignores the case of the letters, and so does the root
      expect((await call<ArchiveListOutput>("archive.list", { archive: join(root.toUpperCase(), "IN.ZIP") })).entries).toHaveLength(1);
    } else {
      await refusal("archive.list", { archive: join(root.toUpperCase(), "in.zip") });
      await refusal("archive.extract", { archive: "in.zip", target: join(root.toUpperCase(), "x") });
    }
  });
});

describe("symlinks and junctions", () => {
  it("refuses an archive path and a target through a linked folder that leads out of the root", async () => {
    linkFolder(outside, join(root, "door"));
    for (const [key, input] of inputsWith("door/out.zip")) {
      const error = await refusal(key, input);
      expect(error.message).toContain("through a symlink");
    }
    await refusal("archive.extract", { archive: "in.zip", target: "door" });
    await refusal("archive.extract", { archive: "in.zip", target: "door/new/deeper" });
    await refusal("archive.create", { output: "new.zip", source: "door" });
    await refusal("archive.create", { output: "new.zip", files: ["secret.txt"], cwd: "door" });
    // The walk reads through the folder of a file: a file through the link is refused
    await refusal("archive.create", { output: "new.zip", files: ["door/secret.txt"] });
    expect(outsideNames()).toEqual(["folder", "out.zip", "secret.txt"]);
    expect(existsSync(join(root, "new.zip"))).toBe(false);
  });

  it("archives a link of the input as a link, and does not read its target", async () => {
    linkFolder(outside, join(root, "door"));
    await call("archive.create", { output: "links.tar", files: ["door", "a.txt"] });
    const listed = await call<ArchiveListOutput>("archive.list", { archive: "links.tar" });
    expect(listed.entries.map((entry) => [entry.path, entry.kind])).toEqual([
      ["door", "symlink"],
      ["a.txt", "file"],
    ]);
  });

  it("refuses a link whose target outside the root does not exist yet", async () => {
    linkFolder(join(outside, "later"), join(root, "later"));
    await refusal("archive.extract", { archive: "in.zip", target: "later" });
    await refusal("archive.extract", { archive: "in.zip", target: "later/sub" });
    await refusal("archive.create", { output: "later/new.zip", source: "sub" });
    expect(existsSync(join(outside, "later"))).toBe(false);
  });

  it("accepts a linked folder whose target is in the root", async () => {
    linkFolder(join(root, "sub"), join(root, "alias"));
    await call("archive.create", { output: "alias/via.zip", files: ["alias/b.txt"] });
    expect(existsSync(join(root, "sub", "via.zip"))).toBe(true);
    expect((await call<ArchiveListOutput>("archive.list", { archive: "alias/via.zip" })).entries.map((entry) => entry.path)).toEqual(["alias/b.txt"]);
    await call("archive.extract", { archive: "in.zip", target: "alias/out" });
    expect(existsSync(join(root, "sub", "out", "b.txt"))).toBe(true);
  });

  it("accepts a root whose own path is a link, by the given path and by the real path", async () => {
    const alias = join(base, "root-alias");
    linkFolder(root, alias);
    const linked = createRegistry(createArchiveModule({ root: alias }));
    expect((await call<ArchiveListOutput>("archive.list", { archive: "in.zip" }, linked)).entries).toHaveLength(1);
    expect((await call<ArchiveListOutput>("archive.list", { archive: join(alias, "in.zip") }, linked)).entries).toHaveLength(1);
    expect((await call<ArchiveListOutput>("archive.list", { archive: join(root, "in.zip") }, linked)).entries).toHaveLength(1);
    await call("archive.extract", { archive: "in.zip", target: "via-alias" }, linked);
    expect(existsSync(join(root, "via-alias", "b.txt"))).toBe(true);
    await refusal("archive.list", { archive: "../outside/out.zip" }, linked);
    await refusal("archive.extract", { archive: "in.zip", target: "../outside/x" }, linked);
  });

  it.skipIf(!FILE_LINKS)("refuses a file symlink that points out of the root, also when its target is missing", async () => {
    symlinkSync(join(outside, "out.zip"), join(root, "out-link.zip"), "file");
    await refusal("archive.list", { archive: "out-link.zip" });
    await refusal("archive.extract", { archive: "out-link.zip", target: "x" });
    await refusal("archive.create", { output: "out-link.zip", source: "sub", overwrite: true });
    symlinkSync(join(outside, "planted.zip"), join(root, "dangling.zip"), "file");
    await refusal("archive.create", { output: "dangling.zip", source: "sub" });
    expect(existsSync(join(outside, "planted.zip"))).toBe(false);
    expect(outsideNames()).toEqual(["folder", "out.zip", "secret.txt"]);
  });
});

describe("the functions of the root", () => {
  it("isInside treats a name that starts with .. as a name, not as a parent", () => {
    expect(isInside(root, join(root, "..x"))).toBe(true);
    expect(isInside(root, join(root, "..", "x"))).toBe(false);
    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, `${root}2`)).toBe(false);
    expect(isInside(root, `${root}${sep}sub`)).toBe(true);
  });

  it("isOutsideRoot is true only for FORBIDDEN with the reason outside-root", () => {
    expect(isOutsideRoot(outsideRoot(["archive", "list"], "x"))).toBe(true);
    expect(isOutsideRoot(new InvocationError("FORBIDDEN", "x", ["archive", "list"], "host-not-allowed"))).toBe(false);
    expect(isOutsideRoot(new Error("x"))).toBe(false);
  });

  it("realPathOf follows a link whose target does not exist, and stops a chain of too many links with ELOOP", async () => {
    linkFolder(join(outside, "missing"), join(root, "dangling"));
    expect(await realPathOf(join(root, "dangling", "x.zip"))).toBe(join(await realpath(outside), "missing", "x.zip"));
    await expect(realPathOf(join(root, "dangling"), 40)).rejects.toMatchObject({ code: "ELOOP" });
    expect(await realPathOf(join(root, "no", "such", "file"))).toBe(join(await realpath(root), "no", "such", "file"));
    // A path under a file: ENOTDIR on POSIX, ENOENT on Windows
    expect(await realPathOf(join(root, "a.txt", "x"))).toBe(join(await realpath(root), "a.txt", "x"));
  });

  it("gives the error of a root that cannot be read, other than a missing folder", async () => {
    const broken = createRegistry(createArchiveModule({ root: join(base, "bad\0root") }));
    const error: unknown = await call("archive.list", { archive: "in.zip" }, broken).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeDefined();
    expect(String(error)).not.toContain("does not exist");
  });

  it("resolves a relative root against the working folder of the process", async () => {
    const relativeRoot = relative(process.cwd(), root);
    const rooted = createRegistry(createArchiveModule({ root: relativeRoot }));
    expect((await call<ArchiveListOutput>("archive.list", { archive: "in.zip" }, rooted)).entries).toHaveLength(1);
    expect((await resolveRoot(relativeRoot)).folder).toBe(root);
  });
});
