/**
 * Each file procedure through a registry (roadmap R33): the happy path, the main errors, and the
 * declared effects against what the procedure does to a real temporary folder.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createRegistry, invokePath, outputValue, type Effects, type ProcedureRegistry } from "@procedures/client";
import { fsModule } from "./module.js";
import type {
  CopyOutput,
  ExistsOutput,
  GlobOutput,
  MkdirOutput,
  MoveOutput,
  ReadJsonOutput,
  ReadOutput,
  ReaddirOutput,
  RmOutput,
  StatOutput,
  WriteOutput,
} from "./types.js";

const registry: ProcedureRegistry = createRegistry(fsModule);

/** This function starts a procedure of the registry, with the validation of its input and output. */
async function call<T>(key: string, input: unknown): Promise<T> {
  const path = key === "fs.read.json" ? ["fs", "read.json"] : key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

/** The files and folders under a folder: each relative path, with the content of a file. */
function tree(folder: string): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const key = relative(folder, path).split("\\").join("/");
      if (entry.isDirectory()) {
        result[`${key}/`] = "";
        visit(path);
      } else {
        result[key] = readFileSync(path, "utf8");
      }
    }
  };
  visit(folder);
  return result;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "client-fs-procedures-"));
  writeFileSync(join(dir, "a.txt"), "alpha");
  mkdirSync(join(dir, "sub", "deep"), { recursive: true });
  writeFileSync(join(dir, "sub", "b.txt"), "beta");
  writeFileSync(join(dir, "sub", "deep", "c.json"), JSON.stringify({ name: "c", list: [1, 2] }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("fs.read", () => {
  it("gives the content and the stats of a file", async () => {
    const result = await call<ReadOutput>("fs.read", { path: join(dir, "a.txt") });
    expect(result.content).toBe("alpha");
    expect(result.path).toBe(join(dir, "a.txt"));
    expect(result.stats).toMatchObject({ type: "file", size: 5 });
  });

  it("reads with another encoding", async () => {
    const result = await call<ReadOutput>("fs.read", { path: join(dir, "a.txt"), encoding: "base64" });
    expect(result.content).toBe(Buffer.from("alpha").toString("base64"));
  });

  it("fails with ENOENT for a missing file, and validates its input", async () => {
    await expect(call("fs.read", { path: join(dir, "missing.txt") })).rejects.toMatchObject({ code: "ENOENT" });
    await expect(call("fs.read", {})).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("fs.write", () => {
  it("makes a file, replaces it, and counts the bytes of UTF-8", async () => {
    const path = join(dir, "new.txt");
    const first = await call<WriteOutput>("fs.write", { path, content: "héllo" });
    expect(first).toEqual({ path, bytesWritten: 6 });
    await call("fs.write", { path, content: "x" });
    expect(readFileSync(path, "utf8")).toBe("x");
  });

  it("appends with mode append", async () => {
    await call("fs.write", { path: join(dir, "a.txt"), content: "+1", mode: "append" });
    await call("fs.write", { path: join(dir, "a.txt"), content: "+2", mode: "append" });
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("alpha+1+2");
  });

  it("fails with ENOENT when the folder is missing, and refuses an unknown mode", async () => {
    await expect(call("fs.write", { path: join(dir, "no", "x.txt"), content: "x" })).rejects.toMatchObject({ code: "ENOENT" });
    await expect(call("fs.write", { path: join(dir, "x.txt"), content: "x", mode: "replace" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(existsSync(join(dir, "x.txt"))).toBe(false);
  });
});

describe("fs.exists", () => {
  it("gives the stats of a path that exists", async () => {
    const result = await call<ExistsOutput>("fs.exists", { path: join(dir, "sub") });
    expect(result).toMatchObject({ exists: true, stats: { type: "directory" } });
  });

  it("gives exists: false for a missing path", async () => {
    expect(await call<ExistsOutput>("fs.exists", { path: join(dir, "missing") })).toEqual({ exists: false });
  });
});

describe("fs.stat", () => {
  it("gives the type, the size and the times", async () => {
    const file = await call<StatOutput>("fs.stat", { path: join(dir, "sub", "b.txt") });
    expect(file).toMatchObject({ path: join(dir, "sub", "b.txt"), type: "file", size: 4 });
    expect(new Date(file.mtime).toISOString()).toBe(file.mtime);
    expect((await call<StatOutput>("fs.stat", { path: join(dir, "sub") })).type).toBe("directory");
  });

  it("fails with ENOENT for a missing path", async () => {
    await expect(call("fs.stat", { path: join(dir, "missing") })).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("fs.mkdir", () => {
  it("makes the missing parents, and gives created: false the second time", async () => {
    const path = join(dir, "x", "y", "z");
    expect(await call<MkdirOutput>("fs.mkdir", { path })).toEqual({ path, created: true });
    expect(statSync(path).isDirectory()).toBe(true);
    expect(await call<MkdirOutput>("fs.mkdir", { path })).toEqual({ path, created: false });
  });

  it("fails with EEXIST for a file, and with ENOENT without recursive", async () => {
    await expect(call("fs.mkdir", { path: join(dir, "a.txt") })).rejects.toMatchObject({ code: "EEXIST" });
    await expect(call("fs.mkdir", { path: join(dir, "p", "q"), recursive: false })).rejects.toMatchObject({ code: "ENOENT" });
    expect(existsSync(join(dir, "p"))).toBe(false);
  });
});

describe("fs.rm", () => {
  it("removes a file, and a folder with recursive", async () => {
    expect(await call<RmOutput>("fs.rm", { path: join(dir, "a.txt") })).toEqual({ path: join(dir, "a.txt"), removed: true });
    expect(existsSync(join(dir, "a.txt"))).toBe(false);
    await call("fs.rm", { path: join(dir, "sub"), recursive: true });
    expect(existsSync(join(dir, "sub"))).toBe(false);
  });

  it("fails for a missing path, and gives removed: false with force", async () => {
    await expect(call("fs.rm", { path: join(dir, "missing") })).rejects.toMatchObject({ code: "ENOENT" });
    expect(await call<RmOutput>("fs.rm", { path: join(dir, "missing"), force: true })).toMatchObject({ removed: false });
  });

  it("keeps a folder that is not empty without recursive", async () => {
    await expect(call("fs.rm", { path: join(dir, "sub") })).rejects.toThrow();
    expect(readFileSync(join(dir, "sub", "b.txt"), "utf8")).toBe("beta");
  });
});

describe("fs.readdir", () => {
  it("gives the entries with their types", async () => {
    const result = await call<ReaddirOutput>("fs.readdir", { path: join(dir, "sub") });
    expect(result.entries.map((entry) => [entry.name, entry.type]).sort()).toEqual([
      ["b.txt", "file"],
      ["deep", "directory"],
    ]);
    expect(result.entries.every((entry) => entry.stats === undefined)).toBe(true);
  });

  it("reads the subfolders with recursive, and gives the stats with includeStats", async () => {
    const result = await call<ReaddirOutput>("fs.readdir", { path: dir, recursive: true, includeStats: true });
    const names = result.entries.map((entry) => relative(dir, entry.path).split("\\").join("/")).sort();
    expect(names).toEqual(["a.txt", "sub", "sub/b.txt", "sub/deep", "sub/deep/c.json"]);
    expect(result.entries.find((entry) => entry.name === "a.txt")?.stats).toMatchObject({ type: "file", size: 5 });
  });

  it("fails with ENOENT for a missing folder", async () => {
    await expect(call("fs.readdir", { path: join(dir, "missing") })).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("fs.copy", () => {
  it("copies a file and a folder", async () => {
    const dest = join(dir, "copy.txt");
    expect(await call<CopyOutput>("fs.copy", { src: join(dir, "a.txt"), dest })).toEqual({ src: join(dir, "a.txt"), dest });
    expect(readFileSync(dest, "utf8")).toBe("alpha");
    await call("fs.copy", { src: join(dir, "sub"), dest: join(dir, "sub2") });
    expect(readFileSync(join(dir, "sub2", "deep", "c.json"), "utf8")).toContain('"name":"c"');
  });

  it("refuses an existing destination without overwrite, and changes nothing", async () => {
    const dest = join(dir, "sub", "b.txt");
    // recursive: false copies with COPYFILE_EXCL: an existing file is an error
    await expect(call("fs.copy", { src: join(dir, "a.txt"), dest, recursive: false })).rejects.toMatchObject({ code: "EEXIST" });
    // The default (recursive: true) refuses too. Before, cp kept the file and fs.copy reported success.
    await expect(call("fs.copy", { src: join(dir, "a.txt"), dest })).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(dest, "utf8")).toBe("beta");
    // A folder over an existing folder: no file arrives in it
    mkdirSync(join(dir, "other"));
    await expect(call("fs.copy", { src: join(dir, "sub"), dest: join(dir, "other") })).rejects.toMatchObject({ code: "EEXIST" });
    expect(readdirSync(join(dir, "other"))).toEqual([]);
  });

  it("replaces an existing destination with overwrite", async () => {
    const dest = join(dir, "sub", "b.txt");
    await call("fs.copy", { src: join(dir, "a.txt"), dest, overwrite: true });
    expect(readFileSync(dest, "utf8")).toBe("alpha");
    writeFileSync(dest, "beta");
    await call("fs.copy", { src: join(dir, "a.txt"), dest, recursive: false, overwrite: true });
    expect(readFileSync(dest, "utf8")).toBe("alpha");
    mkdirSync(join(dir, "other"));
    await call("fs.copy", { src: join(dir, "sub"), dest: join(dir, "other"), overwrite: true });
    expect(readFileSync(join(dir, "other", "deep", "c.json"), "utf8")).toContain('"name":"c"');
  });

  it("fails with ENOENT for a missing source", async () => {
    await expect(call("fs.copy", { src: join(dir, "missing"), dest: join(dir, "x") })).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stops at an error of the check of the destination that is not ENOENT", async () => {
    // A NUL character in a path: the check fails with ERR_INVALID_ARG_VALUE, and nothing is copied
    await expect(call("fs.copy", { src: join(dir, "a.txt"), dest: join(dir, "bad\u0000name") })).rejects.toMatchObject({ code: "ERR_INVALID_ARG_VALUE" });
  });
});

describe("fs.move", () => {
  it("renames a file", async () => {
    const dest = join(dir, "renamed.txt");
    expect(await call<MoveOutput>("fs.move", { src: join(dir, "a.txt"), dest })).toEqual({ src: join(dir, "a.txt"), dest });
    expect(existsSync(join(dir, "a.txt"))).toBe(false);
    expect(readFileSync(dest, "utf8")).toBe("alpha");
  });

  it("refuses an existing destination without overwrite, and replaces it with overwrite", async () => {
    const dest = join(dir, "sub", "b.txt");
    await expect(call("fs.move", { src: join(dir, "a.txt"), dest })).rejects.toThrow("Destination already exists");
    expect(readFileSync(dest, "utf8")).toBe("beta");
    await call("fs.move", { src: join(dir, "a.txt"), dest, overwrite: true });
    expect(readFileSync(dest, "utf8")).toBe("alpha");
    expect(existsSync(join(dir, "a.txt"))).toBe(false);
  });

  it("fails with ENOENT for a missing source", async () => {
    await expect(call("fs.move", { src: join(dir, "missing"), dest: join(dir, "x") })).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("fs.glob", () => {
  it("finds the files of a pattern under cwd", async () => {
    const result = await call<GlobOutput>("fs.glob", { pattern: "**/*.txt", cwd: dir });
    expect(result).toEqual({ pattern: "**/*.txt", matches: ["a.txt", "sub/b.txt"] });
  });

  it("validates its input", async () => {
    await expect(call("fs.glob", { pattern: 7 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("fs.read.json", () => {
  it("parses a JSON file", async () => {
    const result = await call<ReadJsonOutput>("fs.read.json", { path: join(dir, "sub", "deep", "c.json") });
    expect(result.data).toEqual({ name: "c", list: [1, 2] });
    expect(result.stats.type).toBe("file");
  });

  it("fails for a file that is not JSON, and for a missing file", async () => {
    await expect(call("fs.read.json", { path: join(dir, "a.txt") })).rejects.toThrow(SyntaxError);
    await expect(call("fs.read.json", { path: join(dir, "missing.json") })).rejects.toMatchObject({ code: "ENOENT" });
  });
});

// =============================================================================
// The declared effects against what each procedure does
// =============================================================================

/** The declaration of each procedure, as `metadata.effects` gives it. */
const DECLARED: Record<string, Effects> = {
  "fs.read": { reads: ["fs"], writes: [] },
  "fs.exists": { reads: ["fs"], writes: [] },
  "fs.stat": { reads: ["fs"], writes: [] },
  "fs.readdir": { reads: ["fs"], writes: [] },
  "fs.glob": { reads: ["fs"], writes: [] },
  "fs.read.json": { reads: ["fs"], writes: [] },
  "fs.write": { reads: [], writes: ["fs"] },
  "fs.mkdir": { reads: ["fs"], writes: ["fs"], destructive: false, idempotent: true },
  "fs.rm": { reads: ["fs"], writes: ["fs"], idempotent: true },
  "fs.copy": { reads: ["fs"], writes: ["fs"], idempotent: true },
  "fs.move": { reads: ["fs"], writes: ["fs"], idempotent: true },
  "fs.write.json": { reads: [], writes: ["fs"], destructive: true, idempotent: true },
  "fs.hash": { reads: ["fs"], writes: [] },
  "fs.temp": { reads: [], writes: ["fs"], destructive: false, idempotent: false },
  "fs.watch": { reads: ["fs"], writes: [] },
};

/**
 * The procedures that the loop below does not run in the folder of a test: fs.temp writes in the
 * temporary folder of the system, and fs.watch is a stream without an end (more.test.ts has their tests).
 */
const NOT_IN_FOLDER = new Set(["fs.temp", "fs.watch"]);

/** An input for each procedure in the folder of a test. */
const INPUTS: Record<string, (folder: string) => Record<string, unknown>> = {
  "fs.read": (folder) => ({ path: join(folder, "a.txt") }),
  "fs.exists": (folder) => ({ path: join(folder, "a.txt") }),
  "fs.stat": (folder) => ({ path: join(folder, "sub") }),
  "fs.readdir": (folder) => ({ path: folder, recursive: true, includeStats: true }),
  "fs.glob": (folder) => ({ pattern: "**/*", cwd: folder, dot: true }),
  "fs.read.json": (folder) => ({ path: join(folder, "sub", "deep", "c.json") }),
  "fs.write": (folder) => ({ path: join(folder, "a.txt"), content: "!", mode: "append" }),
  "fs.mkdir": (folder) => ({ path: join(folder, "made", "here") }),
  "fs.rm": (folder) => ({ path: join(folder, "sub"), recursive: true }),
  "fs.copy": (folder) => ({ src: join(folder, "sub"), dest: join(folder, "sub-copy") }),
  "fs.move": (folder) => ({ src: join(folder, "a.txt"), dest: join(folder, "moved.txt") }),
  "fs.write.json": (folder) => ({ path: join(folder, "written.json"), value: { a: 1 } }),
  "fs.hash": (folder) => ({ path: join(folder, "a.txt") }),
  "fs.temp": () => ({}),
  "fs.watch": (folder) => ({ path: folder }),
};

describe("the effects of the file procedures", () => {
  it("are declared for each procedure of the module", () => {
    const declared = Object.fromEntries(fsModule.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.effects]));
    expect(declared).toEqual(DECLARED);
    expect(Object.keys(INPUTS).sort()).toEqual(Object.keys(DECLARED).sort());
  });

  for (const [key, effects] of Object.entries(DECLARED)) {
    if (NOT_IN_FOLDER.has(key)) continue;
    const reader = effects.writes?.length === 0;
    it(`${key} ${reader ? "changes nothing" : "changes the folder"}${effects.idempotent ? ", and a second call changes nothing more" : ""}`, async () => {
      const before = tree(dir);
      await call(key, INPUTS[key]!(dir));
      const after = tree(dir);
      if (reader) {
        expect(after).toEqual(before);
      } else {
        expect(after).not.toEqual(before);
      }
      if (effects.idempotent) {
        // A second call can fail (the source of a move is gone), but it changes nothing
        await call(key, INPUTS[key]!(dir)).catch(() => undefined);
        expect(tree(dir)).toEqual(after);
      }
    });
  }

  it("fs.write is not idempotent: a second append changes the file again", async () => {
    await call("fs.write", INPUTS["fs.write"]!(dir));
    const after = tree(dir);
    await call("fs.write", INPUTS["fs.write"]!(dir));
    expect(tree(dir)).not.toEqual(after);
  });

  it("fs.mkdir is not destructive: an existing folder keeps its files", async () => {
    await call("fs.mkdir", { path: join(dir, "sub") });
    expect(readFileSync(join(dir, "sub", "b.txt"), "utf8")).toBe("beta");
  });
});
