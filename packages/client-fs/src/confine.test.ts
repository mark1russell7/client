/**
 * The root of the files for all the procedures of a registry (roadmap R33): `confineToRoot()`
 * applies the rules of `metadata.fsRoot`, and decides from the effects for a procedure without
 * rules. The tests use test procedures that record their input, in real temporary folders.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  coreProcedures,
  createRegistry,
  defineModule,
  defineProcedure,
  invokePath,
  outputSchema,
  outputValue,
  type AnyProcedure,
  type Effects,
  type FsRootRules,
  type ProcedureContext,
  type ProcedureRegistry,
} from "@procedures/client";
import { confineToRoot, createFsModule, rootDecisionOf } from "./module.js";
import { OUTSIDE_ROOT } from "./root.js";

/** The inputs that the test procedures got, by key. */
let seen: Record<string, unknown[]>;

/** A test procedure that records its input, with these rules and effects. */
function recorder(key: string, meta: { fsRoot?: FsRootRules; effects?: Effects; calls?: string[] }, body?: (input: Record<string, unknown>, ctx: ProcedureContext) => Promise<unknown>): AnyProcedure {
  return defineProcedure({
    path: key.split("."),
    input: outputSchema<Record<string, unknown>>(),
    output: outputSchema<unknown>(),
    metadata: { effects: { reads: ["fs"], writes: [] }, ...meta },
    handler: async (input: Record<string, unknown>, ctx: ProcedureContext) => {
      (seen[key] ??= []).push(input);
      return body ? body(input, ctx) : input;
    },
  });
}

/** The procedures of the tests. */
function procedures(): AnyProcedure[] {
  return [
    recorder("t.read", { fsRoot: { cwd: "cwd", paths: ["file", "files"], names: ["entries"], values: [":memory:"] } }),
    recorder("t.db", { fsRoot: { paths: ["db"], required: ["db"] } }),
    recorder("t.run", { fsRoot: { cwd: "cwd", program: true }, effects: { reads: ["process"], writes: ["process"] } }),
    recorder("t.tool", { fsRoot: { cwd: "cwd" }, calls: ["t.run"] }, (input, ctx) => ctx.client.call(["t", "run"], { cwd: input["cwd"], command: "tool" })),
    recorder("t.other", { fsRoot: { cwd: "cwd" } }, (_input, ctx) => ctx.client.call(["t", "run"], { command: "other" })),
    recorder("t.free", { effects: { reads: ["network"], writes: [] }, calls: ["t.run"] }, (_input, ctx) => ctx.client.call(["t", "run"], { command: "free" })),
    recorder("t.refused", { fsRoot: { refuse: "it reaches each folder of the host" } }),
    recorder("t.files", {}),
    recorder("t.program", { effects: { reads: [], writes: ["process"] } }),
    recorder("t.unknown", { effects: { reads: ["fs"] } }),
    recorder("t.network", { effects: { reads: ["network"], writes: ["network"] } }),
    defineProcedure({
      path: ["t", "stream"],
      input: outputSchema<Record<string, unknown>>(),
      output: outputSchema<string>(),
      metadata: { effects: { reads: ["fs"], writes: [] }, fsRoot: { cwd: "cwd" } },
      handler: async function* (input: Record<string, unknown>) {
        yield String(input["cwd"]);
        yield "end";
      },
    }),
  ];
}

let base: string;
let root: string;
let outside: string;
let registry: ProcedureRegistry;

beforeEach(() => {
  seen = {};
  base = mkdtempSync(join(tmpdir(), "client-fs-confine-"));
  root = join(base, "root");
  outside = join(base, "outside");
  mkdirSync(join(root, "sub"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(root, "sub", "a.txt"), "a");
  writeFileSync(join(outside, "secret.txt"), "secret");
  registry = createRegistry(createFsModule(), defineModule("test", procedures()), defineModule("core", coreProcedures));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

/** The value of a call of a path of the registry. */
async function call(path: string, input: unknown, on: ProcedureRegistry = registry): Promise<unknown> {
  return outputValue(await invokePath(path.split("."), input, { registry: on }));
}

/** A call that the root refuses: FORBIDDEN with the reason outside-root. */
async function refused(path: string, input: unknown): Promise<string> {
  const error = await call(path, input).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toMatchObject({ code: "FORBIDDEN", reason: OUTSIDE_ROOT });
  return (error as Error).message;
}

describe("rootDecisionOf", () => {
  it("gives the kind of each procedure from its rules, or from its effects", () => {
    const kinds = Object.fromEntries(registry.getAll().filter((p) => p.path[0] === "t").map((p) => [p.path.join("."), rootDecisionOf(p).kind]));
    expect(kinds).toEqual({
      "t.read": "confined",
      "t.db": "confined",
      "t.run": "program",
      "t.tool": "confined",
      "t.other": "confined",
      "t.free": "unchanged",
      "t.refused": "refused",
      "t.files": "refused",
      "t.program": "refused",
      "t.unknown": "refused",
      "t.network": "unchanged",
      "t.stream": "confined",
    });
    expect(rootDecisionOf(registry.get(["fs", "read"])!).kind).toBe("fs");
    // The control flow runs the refs of its caller: each nested call gets its own decision
    expect(rootDecisionOf(registry.get(["client", "chain"])!).kind).toBe("unchanged");
    expect(rootDecisionOf(registry.get(["t", "refused"])!).reason).toBe("it reaches each folder of the host");
    expect(rootDecisionOf(registry.get(["t", "files"])!).reason).toContain("reads or writes files");
    expect(rootDecisionOf(registry.get(["t", "program"])!).reason).toContain("starts a program");
    expect(rootDecisionOf(registry.get(["t", "unknown"])!).reason).toContain("no effects");
  });

  it("throws for rules that are not correct", () => {
    const bad = (fsRoot: unknown) => rootDecisionOf({ path: ["t", "bad"], metadata: { fsRoot } as never, handler: () => null });
    expect(() => bad("cwd")).toThrow("must be an object");
    expect(() => bad({ cwd: "cwd", folder: "x" })).toThrow("unknown key folder");
    expect(() => bad({ cwd: "" })).toThrow("cwd must be");
    expect(() => bad({ paths: "file" })).toThrow("paths must be a list");
    expect(() => bad({ refuse: "no", cwd: "cwd" })).toThrow("refuse cannot go with other rules");
    expect(() => bad({ paths: ["a"], required: ["b"] })).toThrow("required input b is not in paths");
    expect(() => bad({ cwd: "a", paths: ["a"] })).toThrow("more than one");
    expect(() => bad({ program: "yes" })).toThrow("program must be");
  });
});

describe("confineToRoot", () => {
  it("sorts the procedures, adds none, and changes nothing without a root", async () => {
    const before = registry.getAll().map((p) => p.path.join(".")).sort();
    const result = confineToRoot(registry, root);
    expect(registry.getAll().map((p) => p.path.join(".")).sort()).toEqual(before);
    expect(result.root).toBe(root);
    expect(result.fs).toContain("fs.read");
    expect(result.confined.sort()).toEqual(["t.db", "t.other", "t.read", "t.stream", "t.tool"]);
    expect(result.programs).toEqual(["t.run"]);
    expect(result.refused.sort()).toEqual(["t.files", "t.program", "t.refused", "t.unknown"]);
    expect(result.unchanged).toEqual(expect.arrayContaining(["t.free", "t.network", "client.chain"]));
    // A registry without the root runs each procedure as before
    const plain = createRegistry(defineModule("test", procedures()));
    expect(await call("t.read", { cwd: outside, file: "secret.txt" }, plain)).toEqual({ cwd: outside, file: "secret.txt" });
    expect(await call("t.refused", {}, plain)).toEqual({});
    expect(await call("t.run", { command: "x" }, plain)).toEqual({ command: "x" });
  });

  it("gives the absolute paths in the root to a confined procedure, with the root as the default working folder", async () => {
    confineToRoot(registry, root);
    expect(await call("t.read", {})).toEqual({ cwd: root });
    // A path starts at the root, also with a working folder
    expect(await call("t.read", { cwd: "sub", file: "sub/a.txt", files: ["a.txt", "sub/../new.txt"] })).toEqual({
      cwd: join(root, "sub"),
      file: join(root, "sub", "a.txt"),
      files: [join(root, "a.txt"), join(root, "new.txt")],
    });
    // A value that is not a path, and names that start at the working folder and stay as they are
    expect(await call("t.read", { file: ":memory:", entries: ["sub/a.txt"] })).toEqual({ cwd: root, file: ":memory:", entries: ["sub/a.txt"] });
    expect(await call("t.read", { cwd: "sub", entries: ["a.txt", "../sub/a.txt"] })).toEqual({ cwd: join(root, "sub"), entries: ["a.txt", "../sub/a.txt"] });
    // A stream keeps its items
    const items: unknown[] = [];
    const output = await invokePath(["t", "stream"], {}, { registry });
    expect(output.kind).toBe("stream");
    if (output.kind === "stream") for await (const item of output.items) items.push(item);
    expect(items).toEqual([root, "end"]);
  });

  it("refuses a path outside the root in the working folder, a path and a name, before the handler starts", async () => {
    confineToRoot(registry, root);
    expect(await refused("t.read", { cwd: outside })).toContain("outside the root");
    expect(await refused("t.read", { file: join(outside, "secret.txt") })).toContain("outside the root");
    expect(await refused("t.read", { cwd: "sub", file: "../outside/secret.txt" })).toContain("outside the root");
    await refused("t.read", { files: ["sub/a.txt", join(outside, "secret.txt")] });
    await refused("t.read", { entries: ["../outside/secret.txt"] });
    await refused("t.read", { cwd: "sub", entries: ["../../outside/secret.txt"] });
    await refused("t.read", { file: 5 });
    expect(seen["t.read"]).toBeUndefined();
  });

  it("refuses a path through a linked folder that leads out of the root", async () => {
    symlinkSync(outside, join(root, "link"), process.platform === "win32" ? "junction" : "dir");
    confineToRoot(registry, root);
    expect(await refused("t.read", { file: "link/secret.txt" })).toContain("symlink");
    await refused("t.read", { cwd: "link" });
  });

  it("refuses a call without a required path, and accepts it with one", async () => {
    confineToRoot(registry, root);
    expect(await refused("t.db", {})).toContain("give a path in the root");
    expect(await call("t.db", { db: "data.db" })).toEqual({ db: join(root, "data.db") });
  });

  it("refuses the procedures that it cannot confine, with the reason", async () => {
    confineToRoot(registry, root);
    expect(await refused("t.refused", {})).toContain("it reaches each folder of the host");
    expect(await refused("t.files", {})).toContain("metadata.fsRoot");
    await refused("t.program", {});
    await refused("t.unknown", {});
    expect(await call("t.network", { a: 1 })).toEqual({ a: 1 });
    expect(seen["t.refused"]).toBeUndefined();
  });

  it("runs a program procedure only as the nested call of a confined procedure that names it", async () => {
    confineToRoot(registry, root);
    // A client
    expect(await refused("t.run", { command: "x" })).toContain("not for a client");
    // A confined caller that names it: the program gets a working folder in the root
    expect(await call("t.tool", { cwd: "sub" })).toEqual({ cwd: join(root, "sub"), command: "tool" });
    expect(await call("t.tool", {})).toEqual({ cwd: root, command: "tool" });
    // A confined caller that does not name it, a caller that is not confined, and the control flow
    expect(await refused("t.other", {})).toContain("not for t.other");
    expect(await refused("t.free", {})).toContain("not for t.free");
    await refused("client.chain", { steps: [{ $proc: ["t", "run"], input: { command: "chain" } }] });
    expect(seen["t.run"]).toEqual([{ cwd: join(root, "sub"), command: "tool" }, { cwd: root, command: "tool" }]);
  });

  it("keeps the root of the fs procedures", async () => {
    confineToRoot(registry, root);
    expect(await call("fs.read", { path: "sub/a.txt" })).toMatchObject({ content: "a" });
    await refused("fs.read", { path: join(outside, "secret.txt") });
  });

  it("changes nothing when it throws", async () => {
    const broken = recorder("t.broken", { fsRoot: { cwd: "cwd", wrong: true } as never });
    const withBroken = createRegistry(createFsModule(), defineModule("test", [...procedures(), broken]));
    expect(() => confineToRoot(withBroken, root)).toThrow("unknown key wrong");
    expect(await call("t.refused", {}, withBroken)).toEqual({});
    expect(await call("fs.read", { path: join(outside, "secret.txt") }, withBroken)).toMatchObject({ content: "secret" });
    expect(() => confineToRoot(registry, join(base, "missing"))).toThrow("does not exist");
    expect(() => confineToRoot(registry, join(root, "sub", "a.txt"))).toThrow("not a folder");
  });

  it("fails each call when the root goes away after the start", async () => {
    confineToRoot(registry, root);
    rmSync(root, { recursive: true, force: true });
    await expect(call("t.read", {})).rejects.toThrow("does not exist");
  });
});
