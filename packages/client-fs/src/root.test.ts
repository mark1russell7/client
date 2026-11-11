/**
 * The root of the file procedures (roadmap R33): `createFsModule({ root })` confines each path of
 * each input to the root. A relative path starts at the root. `..`, an absolute path outside the
 * root, another drive and a symlink (or a junction) that leads out are refused with `FORBIDDEN`
 * and the reason `outside-root`. The tests use real temporary folders, on Windows and on POSIX.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, relative, sep } from "node:path";
import {
  Client,
  InvocationError,
  LocalTransport,
  ProcedureServer,
  createRegistry,
  defineModule,
  defineProcedure,
  hostPolicy,
  invokePath,
  outputSchema,
  outputValue,
  procedureServerOptions,
  type AnyProcedure,
  type ProcedureContext,
  type ProcedureRegistry,
} from "@procedures/client";
import { confineFsProcedures, createFsModule, fsModule, registerFsProcedures } from "./module.js";
import { SYSTEM_LINK_RULE, linkDestination, type LinkRule } from "./link-target.js";
import { OUTSIDE_ROOT, isInside, isOutsideRoot, realPathOf } from "./root.js";
import type { ExistsOutput, GlobOutput, ReadOutput, ReaddirOutput, WriteOutput } from "./types.js";

const WINDOWS = process.platform === "win32";

/** A link to a folder: a junction on Windows (no privilege needed), a symlink elsewhere. */
function linkFolder(target: string, path: string): void {
  symlinkSync(target, path, WINDOWS ? "junction" : "dir");
}

/** True when this process can make a symlink to a file (Windows needs a privilege for it). */
function canLinkFiles(): boolean {
  const probe = mkdtempSync(join(tmpdir(), "client-fs-link-probe-"));
  try {
    writeFileSync(join(probe, "target"), "");
    symlinkSync(join(probe, "target"), join(probe, "link"), "file");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

const FILE_LINKS = canLinkFiles();

let base: string;
let root: string;
let outside: string;
let registry: ProcedureRegistry;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "client-fs-root-"));
  root = join(base, "root");
  outside = join(base, "outside");
  mkdirSync(join(root, "sub"), { recursive: true });
  mkdirSync(outside);
  // A sibling whose name starts with the name of the root
  mkdirSync(join(base, "root2"));
  writeFileSync(join(root, "a.txt"), "alpha");
  writeFileSync(join(root, "sub", "b.txt"), "beta");
  writeFileSync(join(root, "data.json"), '{"ok":true}');
  writeFileSync(join(outside, "secret.txt"), "secret");
  writeFileSync(join(base, "root2", "c.txt"), "gamma");
  registry = createRegistry(createFsModule({ root }));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = registry): Promise<T> {
  const path = key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry: at }), path);
}

/** The error of a call that the root refuses. */
async function refusal(key: string, input: unknown): Promise<InvocationError> {
  const error: unknown = await call(key, input).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(InvocationError);
  expect(error).toMatchObject({ code: "FORBIDDEN", reason: OUTSIDE_ROOT });
  expect(isOutsideRoot(error)).toBe(true);
  return error as InvocationError;
}

/** Each procedure with a path input, and an input whose paths are all `path`. */
function inputsWith(path: string): Array<[string, Record<string, unknown>]> {
  return [
    ["fs.read", { path }],
    ["fs.write", { path, content: "x" }],
    ["fs.exists", { path }],
    ["fs.mkdir", { path }],
    ["fs.rm", { path, recursive: true, force: true }],
    ["fs.readdir", { path }],
    ["fs.stat", { path }],
    ["fs.read.json", { path }],
    ["fs.copy", { src: path, dest: join(root, "copy") }],
    ["fs.copy", { src: join(root, "a.txt"), dest: path }],
    ["fs.move", { src: path, dest: join(root, "moved") }],
    ["fs.move", { src: join(root, "a.txt"), dest: path }],
    ["fs.glob", { pattern: "*", cwd: path }],
  ];
}

describe("createFsModule", () => {
  it("gives fsModule without a root, so the behaviour stays as before", async () => {
    expect(createFsModule()).toBe(fsModule);
    expect(createFsModule({})).toBe(fsModule);
    const plain = createRegistry(fsModule);
    const result = await call<ReadOutput>("fs.read", { path: join(outside, "secret.txt") }, plain);
    expect(result.content).toBe("secret");
  });

  it("gives the same procedures and metadata with a root", () => {
    const rooted = createFsModule({ root });
    expect(rooted.name).toBe(fsModule.name);
    expect(rooted.procedures.map((procedure) => procedure.path)).toEqual(fsModule.procedures.map((procedure) => procedure.path));
    expect(rooted.procedures.map((procedure) => procedure.metadata)).toEqual(fsModule.procedures.map((procedure) => procedure.metadata));
    rooted.procedures.forEach((procedure, index) => expect(procedure.handler).not.toBe(fsModule.procedures[index]!.handler));
  });

  it("replaces the fsModule that another module requires, when it comes first", async () => {
    const bundle = defineModule("bundle-that-requires-fs", [], [fsModule]);
    const host = createRegistry(createFsModule({ root }), bundle);
    await expect(call("fs.read", { path: join(outside, "secret.txt") }, host)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("registerFsProcedures takes the root too", async () => {
    const host = createRegistry();
    registerFsProcedures(host, { root });
    expect((await call<ReadOutput>("fs.read", { path: "a.txt" }, host)).content).toBe("alpha");
    await expect(call("fs.read", { path: "../outside/secret.txt" }, host)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails each call when the root does not exist", async () => {
    const missing = createRegistry(createFsModule({ root: join(base, "missing") }));
    await expect(call("fs.read", { path: "a.txt" }, missing)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(call("fs.read", { path: "a.txt" }, missing)).rejects.toThrow("The root of the file procedures does not exist");
  });
});

describe("confineFsProcedures (the root of a host)", () => {
  /** A procedure of another package that reads a file with a nested call of fs.read. */
  const reader = defineProcedure({
    path: ["tool", "readFile"],
    input: outputSchema<{ path: string }>(),
    output: outputSchema<unknown>(),
    metadata: { calls: ["fs.read"] },
    handler: (async (input: { path: string }, ctx: ProcedureContext) => ctx.client.call(["fs", "read"], { path: input.path })) as never,
  }) as AnyProcedure;

  it("replaces the handlers of the fs procedures of a registry, and confines the nested calls", async () => {
    const host = createRegistry(fsModule, defineModule("tool", [reader], [fsModule]));
    const before = host.getAll().length;
    const confined = confineFsProcedures(host, root);
    expect(confined.root).toBe(root);
    expect(confined.procedures.sort()).toEqual(fsModule.procedures.map((procedure) => procedure.path.join(".")).sort());
    expect(host.getAll().length).toBe(before);
    expect((await call<ReadOutput>("fs.read", { path: "a.txt" }, host)).content).toBe("alpha");
    await expect(call("fs.read", { path: join(outside, "secret.txt") }, host)).rejects.toMatchObject({ code: "FORBIDDEN", reason: OUTSIDE_ROOT });
    // The nested call of another procedure goes to the confined fs.read
    expect(await call("tool.readFile", { path: join(root, "a.txt") }, host)).toMatchObject({ content: "alpha" });
    await expect(call("tool.readFile", { path: join(outside, "secret.txt") }, host)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("adds no procedure to a registry without fs procedures", () => {
    const host = createRegistry();
    const before = host.getAll().length;
    expect(confineFsProcedures(host, root).procedures).toEqual([]);
    expect(host.getAll().length).toBe(before);
  });

  it("refuses a root that does not exist or is a file, and an fs procedure of another package", () => {
    expect(() => confineFsProcedures(createRegistry(fsModule), join(base, "missing"))).toThrow("does not exist");
    expect(() => confineFsProcedures(createRegistry(fsModule), join(root, "a.txt"))).toThrow("is not a folder");
    const other = defineProcedure({ path: ["fs", "other"], input: outputSchema<unknown>(), output: outputSchema<unknown>(), handler: () => 1 }) as AnyProcedure;
    const host = createRegistry(fsModule, defineModule("other", [other]));
    expect(() => confineFsProcedures(host, root)).toThrow("cannot confine fs.other");
    // The refusal changes nothing: fs.read still reads outside the root
    return expect(call<ReadOutput>("fs.read", { path: join(outside, "secret.txt") }, host)).resolves.toMatchObject({ content: "secret" });
  });
});

describe("paths in the root", () => {
  it("resolves a relative path against the root, and gives the absolute path", async () => {
    const result = await call<ReadOutput>("fs.read", { path: "a.txt" });
    expect(result.content).toBe("alpha");
    expect(result.path).toBe(join(root, "a.txt"));
    const written = await call<WriteOutput>("fs.write", { path: "sub/new.txt", content: "new" });
    expect(written.path).toBe(join(root, "sub", "new.txt"));
    expect(readFileSync(join(root, "sub", "new.txt"), "utf8")).toBe("new");
  });

  it("accepts an absolute path in the root, the root itself, and a .. that stays in the root", async () => {
    expect((await call<ReadOutput>("fs.read", { path: join(root, "sub", "b.txt") })).content).toBe("beta");
    expect((await call<ReadOutput>("fs.read", { path: "sub/../a.txt" })).content).toBe("alpha");
    const listing = await call<ReaddirOutput>("fs.readdir", { path: "." });
    expect(listing.entries.map((entry) => entry.name).sort()).toEqual(["a.txt", "data.json", "sub"]);
    expect((await call<ReaddirOutput>("fs.readdir", { path: root })).path).toBe(root);
  });

  it("makes new folders and files in the root", async () => {
    await call("fs.mkdir", { path: "x/y" });
    await call("fs.copy", { src: "sub", dest: "x/y/sub" });
    await call("fs.move", { src: "a.txt", dest: "x/a.txt" });
    expect(readFileSync(join(root, "x", "y", "sub", "b.txt"), "utf8")).toBe("beta");
    expect(readFileSync(join(root, "x", "a.txt"), "utf8")).toBe("alpha");
    expect(await call<ExistsOutput>("fs.exists", { path: "missing.txt" })).toEqual({ exists: false });
    expect((await call<{ data: unknown }>("fs.read.json", { path: "data.json" })).data).toEqual({ ok: true });
  });

  it("globs under the root by default, with matches relative to cwd", async () => {
    expect(await call<GlobOutput>("fs.glob", { pattern: "**/*.txt" })).toEqual({ pattern: "**/*.txt", matches: ["a.txt", "sub/b.txt"] });
    const absolute = await call<GlobOutput>("fs.glob", { pattern: "*.txt", cwd: "sub", absolute: true });
    expect(absolute.matches).toEqual([join(root, "sub", "b.txt")]);
  });
});

describe("paths outside the root", () => {
  it("refuses .. out of the root for each procedure, and changes nothing outside", async () => {
    for (const [key, input] of inputsWith("../outside/secret.txt")) {
      const error = await refusal(key, input);
      expect(error.message).toContain("is outside the root");
      expect(error.path).toEqual(key.split("."));
    }
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
    expect(existsSync(join(root, "copy"))).toBe(false);
    expect(existsSync(join(root, "a.txt"))).toBe(true);
  });

  it("refuses an absolute path outside the root for each procedure", async () => {
    for (const [key, input] of inputsWith(join(outside, "secret.txt"))) await refusal(key, input);
    for (const [key, input] of inputsWith(join(outside, "new", "file.txt"))) await refusal(key, input);
    expect(existsSync(join(outside, "new"))).toBe(false);
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
  });

  it("refuses a sibling folder whose name starts with the name of the root", async () => {
    await refusal("fs.read", { path: join(base, "root2", "c.txt") });
    await refusal("fs.read", { path: "../root2/c.txt" });
  });

  it("refuses the parent of the root", async () => {
    await refusal("fs.readdir", { path: ".." });
    await refusal("fs.rm", { path: base, recursive: true });
    expect(existsSync(root)).toBe(true);
  });

  it("refuses a glob pattern that leaves its folder", async () => {
    await refusal("fs.glob", { pattern: "../outside/*" });
    await refusal("fs.glob", { pattern: "{..,sub}/*.txt" });
    await refusal("fs.glob", { pattern: `${outside.split(sep).join("/")}/*` });
    await refusal("fs.glob", { pattern: "/*" });
  });
});

describe("symlinks and junctions", () => {
  it("refuses a path through a linked folder that leads out of the root", async () => {
    linkFolder(outside, join(root, "door"));
    for (const [key, input] of inputsWith("door/secret.txt")) {
      const error = await refusal(key, input);
      expect(error.message).toContain("through a symlink");
    }
    // A write or a mkdir of a path that does not exist: the check uses the real path of the parent
    await refusal("fs.write", { path: "door/new.txt", content: "x" });
    await refusal("fs.mkdir", { path: "door/new/deeper" });
    await refusal("fs.readdir", { path: "door" });
    expect(existsSync(join(outside, "new.txt"))).toBe(false);
    expect(existsSync(join(outside, "new"))).toBe(false);
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
  });

  it("refuses a link whose target outside the root does not exist yet", async () => {
    linkFolder(join(outside, "later"), join(root, "later"));
    await refusal("fs.mkdir", { path: "later/sub" });
    await refusal("fs.write", { path: "later/x.txt", content: "x" });
    expect(existsSync(join(outside, "later"))).toBe(false);
  });

  it("accepts a linked folder whose target is in the root", async () => {
    linkFolder(join(root, "sub"), join(root, "alias"));
    expect((await call<ReadOutput>("fs.read", { path: "alias/b.txt" })).content).toBe("beta");
    await call("fs.write", { path: "alias/c.txt", content: "via alias" });
    expect(readFileSync(join(root, "sub", "c.txt"), "utf8")).toBe("via alias");
  });

  it("accepts a root whose own path is a link, by the given path and by the real path", async () => {
    const alias = join(base, "root-alias");
    linkFolder(root, alias);
    const linked = createRegistry(createFsModule({ root: alias }));
    expect((await call<ReadOutput>("fs.read", { path: "a.txt" }, linked)).content).toBe("alpha");
    expect((await call<ReadOutput>("fs.read", { path: join(alias, "a.txt") }, linked)).content).toBe("alpha");
    expect((await call<ReadOutput>("fs.read", { path: join(root, "a.txt") }, linked)).content).toBe("alpha");
    await expect(call("fs.read", { path: "../outside/secret.txt" }, linked)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("leaves out the stats of an entry that leads out of the root, and the matches through it", async () => {
    linkFolder(outside, join(root, "door"));
    const listing = await call<ReaddirOutput>("fs.readdir", { path: ".", includeStats: true });
    const byName = Object.fromEntries(listing.entries.map((entry) => [entry.name, entry]));
    expect(byName["door"]?.stats).toBeUndefined();
    expect(byName["a.txt"]?.stats).toMatchObject({ type: "file", size: 5 });
    const matches = await call<GlobOutput>("fs.glob", { pattern: "door/*" });
    expect(matches.matches).toEqual([]);
    const all = await call<GlobOutput>("fs.glob", { pattern: "**/*.txt", dot: true });
    expect(all.matches).toEqual(["a.txt", "sub/b.txt"]);
  });

  it.skipIf(!FILE_LINKS)("refuses a file symlink that points out of the root, also when its target is missing", async () => {
    symlinkSync(join(outside, "secret.txt"), join(root, "secret-link.txt"), "file");
    await refusal("fs.read", { path: "secret-link.txt" });
    await refusal("fs.write", { path: "secret-link.txt", content: "changed" });
    symlinkSync(join(outside, "planted.txt"), join(root, "dangling.txt"), "file");
    await refusal("fs.write", { path: "dangling.txt", content: "planted" });
    expect(existsSync(join(outside, "planted.txt"))).toBe(false);
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
  });
});

/**
 * A table of links with relative targets. Each row makes its folders and links in the temporary
 * folder `base`, and names a path in the root. `lands` gives the file that a write through the
 * path makes, relative to `base`, by each rule of `link-target.ts`: `folders` (POSIX) and `text`
 * (Windows). The targets are literal text with the separator of the system: `path.join` would
 * remove a name before `..`.
 */
interface LinkLayout {
  name: string;
  /** The folders to make, relative to `base`. */
  make: readonly string[];
  /** The links to make, in order. A target is a list of names, or an absolute path in `base`. */
  links: ReadonlyArray<{ at: string; to: readonly string[] | { absolute: string }; kind: "file" | "dir" }>;
  /** The path to write through, relative to `base`. */
  path: string;
  lands: Record<LinkRule, string>;
}

const LINK_LAYOUTS: readonly LinkLayout[] = [
  {
    name: "../../name: up two folders, out of the root",
    make: [],
    links: [{ at: "root/sub/l", to: ["..", "..", "row1"], kind: "file" }],
    path: "root/sub/l",
    lands: { folders: "row1", text: "row1" },
  },
  {
    name: "name/../name, where the first name is a link to a folder outside",
    make: ["outside/far"],
    links: [
      { at: "root/up", to: ["..", "outside", "far"], kind: "dir" },
      { at: "root/l", to: ["up", "..", "row2"], kind: "file" },
    ],
    path: "root/l",
    lands: { folders: "outside/row2", text: "root/row2" },
  },
  {
    name: "a/../../x, where a is a link to a deep folder in the root",
    make: ["root/deep/deeper"],
    links: [
      { at: "root/a", to: ["deep", "deeper"], kind: "dir" },
      { at: "root/l", to: ["a", "..", "..", "row3"], kind: "file" },
    ],
    path: "root/l",
    lands: { folders: "root/row3", text: "row3" },
  },
  {
    name: "an absolute target outside",
    make: [],
    links: [{ at: "root/l", to: { absolute: "outside/row4" }, kind: "file" }],
    path: "root/l",
    lands: { folders: "outside/row4", text: "outside/row4" },
  },
  {
    name: "a chain of two links",
    make: [],
    links: [
      { at: "root/l1", to: ["l2"], kind: "file" },
      { at: "root/l2", to: ["..", "outside", "row5"], kind: "file" },
    ],
    path: "root/l1",
    lands: { folders: "outside/row5", text: "outside/row5" },
  },
  {
    name: "a target through a link to a folder outside",
    make: [],
    links: [
      { at: "root/door", to: ["..", "outside"], kind: "dir" },
      { at: "root/l", to: ["door", "row6"], kind: "file" },
    ],
    path: "root/l",
    lands: { folders: "outside/row6", text: "outside/row6" },
  },
  {
    name: "a path through a link to a folder: the target starts at the real folder of the link",
    make: ["root/r/a/b/c", "root/r/top"],
    links: [
      { at: "root/r/a/b/c/l", to: ["..", "..", "..", "top"], kind: "dir" },
      { at: "root/r/top/d", to: ["..", "..", "..", "row7"], kind: "file" },
    ],
    path: "root/r/a/b/c/l/d",
    lands: { folders: "row7", text: "row7" },
  },
  {
    name: "a link to a missing file in the root",
    make: [],
    links: [{ at: "root/sub/l", to: ["..", "row8"], kind: "file" }],
    path: "root/sub/l",
    lands: { folders: "root/row8", text: "root/row8" },
  },
  {
    name: "a path through a link to a folder, to a missing file in the root",
    make: ["root/r/a/b/c", "root/r/top"],
    links: [
      { at: "root/r/a/b/c/l", to: ["..", "..", "..", "top"], kind: "dir" },
      { at: "root/r/top/ok", to: ["..", "row9"], kind: "file" },
    ],
    path: "root/r/a/b/c/l/ok",
    lands: { folders: "root/r/row9", text: "root/r/row9" },
  },
];

/** The absolute path of a path of the table, relative to `base`. */
function inBase(path: string): string {
  return join(base, ...path.split("/"));
}

function makeLayout(layout: LinkLayout): void {
  for (const folder of layout.make) mkdirSync(inBase(folder), { recursive: true });
  for (const link of layout.links) {
    const target = Array.isArray(link.to) ? link.to.join(sep) : inBase((link.to as { absolute: string }).absolute);
    symlinkSync(target, inBase(link.at), link.kind);
  }
}

/** The files in `base` with this content. The search does not follow a link. */
function filesWith(content: string, folder: string = base): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) found.push(...filesWith(content, path));
    else if (entry.isFile() && readFileSync(path, "utf8") === content) found.push(path);
  }
  return found;
}

/** A real path as a path of the table: relative to the real path of `base`, with `/`. */
function fromBase(path: string): string {
  const rel = relative(realpathSync.native(base), path).split(sep).join("/");
  return WINDOWS ? rel.toLowerCase() : rel;
}

describe("linkDestination", () => {
  it("follows the real folders with the rule folders, and reads the target as text with the rule text", async () => {
    mkdirSync(join(root, "deep", "deeper"), { recursive: true });
    linkFolder(join(root, "deep", "deeper"), join(root, "a"));
    const real = realpathSync.native(root);
    // The link itself does not have to exist: the function reads only its folder
    const link = join(root, "l");
    const target = ["a", "..", "x"].join(sep);
    expect(await linkDestination(link, target, "folders")).toBe(join(real, "deep", "x"));
    expect(await linkDestination(link, target, "text")).toBe(join(real, "x"));
    expect(await linkDestination(link, ["a", "y"].join(sep), "folders")).toBe(join(real, "deep", "deeper", "y"));
    expect(await linkDestination(link, ["a", "y"].join(sep), "text")).toBe(join(real, "a", "y"));
    expect(await linkDestination(link, join(outside, "z"), "folders")).toBe(join(realpathSync.native(outside), "z"));
    expect(await linkDestination(link, join(outside, "z"), "text")).toBe(join(outside, "z"));
  });
});

describe.skipIf(!FILE_LINKS)("the rule of links against the system (skipped where the system refuses to make a symlink)", () => {
  it.each(LINK_LAYOUTS)("realPathOf gives the file that a write with node:fs makes: $name", async (layout) => {
    makeLayout(layout);
    const path = inBase(layout.path);
    const predicted = await realPathOf(path);
    writeFileSync(path, "probe");
    expect({ rule: SYSTEM_LINK_RULE, made: filesWith("probe").map(fromBase) }).toEqual({ rule: SYSTEM_LINK_RULE, made: [layout.lands[SYSTEM_LINK_RULE]] });
    expect(fromBase(predicted)).toBe(layout.lands[SYSTEM_LINK_RULE]);
  });
});

describe.skipIf(!FILE_LINKS)("links with relative targets through the procedures (skipped where the system refuses to make a symlink)", () => {
  it.each(LINK_LAYOUTS)("fs.write and the destination of fs.copy write in the root only: $name", async (layout) => {
    makeLayout(layout);
    const lands = layout.lands[SYSTEM_LINK_RULE];
    const input = layout.path.slice("root/".length);
    if (lands.startsWith("root/")) {
      await call<WriteOutput>("fs.write", { path: input, content: "written" });
      expect(filesWith("written").map(fromBase)).toEqual([lands]);
    } else {
      await refusal("fs.write", { path: input, content: "written" });
      expect(filesWith("written")).toEqual([]);
    }
    writeFileSync(join(root, "copy-source.txt"), "copied");
    if (lands.startsWith("root/")) {
      await call("fs.copy", { src: "copy-source.txt", dest: input, overwrite: true });
    } else {
      await refusal("fs.copy", { src: "copy-source.txt", dest: input, overwrite: true });
    }
    const copies = filesWith("copied").map(fromBase);
    expect(copies.every((copy) => copy.startsWith("root/"))).toBe(true);
    expect(copies.length).toBe(lands.startsWith("root/") ? 2 : 1);
  });
});

describe("Windows and POSIX paths", () => {
  it("compares the paths of the system: case and drives on Windows", async () => {
    if (WINDOWS) {
      // NTFS ignores the case of the letters, and so does the root
      expect((await call<ReadOutput>("fs.read", { path: join(root.toUpperCase(), "A.TXT") })).content).toBe("alpha");
      expect((await call<ReadOutput>("fs.read", { path: `${root.split(sep).join("/")}/sub/b.txt` })).content).toBe("beta");
      expect((await call<ReadOutput>("fs.read", { path: "sub\\b.txt" })).content).toBe("beta");
      const drive = parse(root).root[0]!.toUpperCase();
      const other = drive === "Z" ? "Y" : "Z";
      await refusal("fs.read", { path: `${other}:\\secret.txt` });
      await refusal("fs.read", { path: `${other}:secret.txt` });
      await refusal("fs.glob", { pattern: `${other}:/*` });
      await refusal("fs.read", { path: "..\\outside\\secret.txt" });
    } else {
      // On POSIX, the case is significant: another case is another path
      await refusal("fs.read", { path: join(root.toUpperCase(), "a.txt") });
      expect((await call<ReadOutput>("fs.read", { path: `${root}//sub/./b.txt` })).content).toBe("beta");
    }
  });

  it("isInside treats a name that starts with .. as a name, not as a parent", () => {
    expect(isInside(root, join(root, "..x"))).toBe(true);
    expect(isInside(root, join(root, "..", "x"))).toBe(false);
    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, `${root}2`)).toBe(false);
  });
});

describe("the refusal on the faces of a host", () => {
  it("is FORBIDDEN with the reason outside-root in the response of a ProcedureServer", async () => {
    const server = new ProcedureServer(procedureServerOptions(hostPolicy({}), registry));
    const response = await server.handle({
      id: "1",
      method: { service: "fs", operation: "read" },
      payload: { path: "../outside/secret.txt" },
      metadata: {},
    });
    expect(response.status).toMatchObject({ type: "error", code: "FORBIDDEN", retryable: false });
    expect(response.metadata).toEqual({ reason: OUTSIDE_ROOT });
  });

  it("is a ClientError with the code FORBIDDEN for a Client", async () => {
    const client = new Client({ transport: new LocalTransport({ registry }) });
    await expect(client.call({ service: "fs", operation: "read" }, { path: "../outside/secret.txt" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(client.call({ service: "fs", operation: "read" }, { path: "a.txt" })).resolves.toMatchObject({ content: "alpha" });
  });
});
