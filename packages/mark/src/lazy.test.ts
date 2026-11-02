/**
 * The lazy registry of mark (roadmap O93). A run with a fresh manifest loads only the packages of
 * the path of its call. These tests run in CI after the build: they need the build of each package
 * and a fresh `dist/manifest.json`.
 *
 * - The equivalence gate: for each path of the eager registry, the lazy registry gives the same
 *   procedure (path, JSON Schema of the input, metadata, handler) and the procedures of the
 *   requires. The index of the manifest is the index of the eager load.
 * - The lists: `mark procedure list` and the help give the same bytes in the two modes.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { jsonSchemaOf, pathToKey, type AnyProcedure, type ProcedureRegistry } from "@procedures/client";
import { createLazyEcosystemRegistry, indexOfCommands, loadEcosystemRegistry, packageIndexOf, type PackageIndex } from "./ecosystem.js";
import { readFreshManifest, type Manifest } from "./manifest.js";
import { executeArgs, initCli, initLazyCli, type ManifestContext } from "./cli.js";

let eager: ProcedureRegistry;
let index: PackageIndex;
let manifest: Manifest;

beforeAll(async () => {
  ({ registry: eager, index } = await loadEcosystemRegistry(false, false));
  const fresh = readFreshManifest();
  if (!fresh) throw new Error("dist/manifest.json is missing or stale: build mark (pnpm --filter @procedures/mark build)");
  manifest = fresh;
}, 120000);

afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
});

/** The facts of a procedure that the two registries must share. */
function factsOf(procedure: AnyProcedure | undefined): unknown {
  if (!procedure) return undefined;
  return JSON.parse(JSON.stringify({ path: procedure.path, input: jsonSchemaOf(procedure.input) ?? null, metadata: procedure.metadata ?? null }));
}

describe("the equivalence gate of the lazy registry", () => {
  it("has the index of the eager load in the manifest", () => {
    const eagerIndex = Object.fromEntries(Object.entries(index).filter(([, names]) => names.length > 0));
    expect(indexOfCommands(manifest.commands)).toEqual(eagerIndex);
    // A core procedure has no package
    expect(manifest.commands.find((command) => pathToKey(command.path) === "client.add")?.packages).toEqual([]);
    // Each procedure of a package has a package
    const core = new Set(createLazyEcosystemRegistry({}, false, false, []).getAll().map((procedure) => pathToKey(procedure.path)));
    const without = eager.getAll().map((procedure) => pathToKey(procedure.path)).filter((key) => !core.has(key) && !(key in eagerIndex));
    expect(without, "procedures of a package without a package in the index").toEqual([]);
  });

  it("gives the procedure of the eager registry for each path, with the requires of its packages", async () => {
    const differences: string[] = [];
    const eagerPaths = new Map(eager.getAll().map((procedure) => [pathToKey(procedure.path), procedure.path] as const));
    for (const procedure of eager.getAll()) {
      const key = pathToKey(procedure.path);
      // A fresh registry for each path: the resolve loads only the packages that the index names
      const lazy = createLazyEcosystemRegistry(index, false, false);
      const found = await lazy.resolve(procedure.path);
      if (JSON.stringify(factsOf(found)) !== JSON.stringify(factsOf(procedure))) differences.push(`${key}: other facts`);
      if (found && found.handler !== procedure.handler) differences.push(`${key}: another handler`);
      // The requires: each procedure of the eager index whose packages loaded is in the lazy registry
      const loaded = new Set(index[key] ?? []);
      for (const [other, names] of Object.entries(index)) {
        if (names.length > 0 && names.every((name) => loaded.has(name)) && !lazy.has(eagerPaths.get(other) ?? [other])) differences.push(`${key}: no ${other}`);
      }
      // The lazy registry has no procedure that the eager registry does not have
      for (const extra of lazy.getAll()) {
        if (!eagerPaths.has(pathToKey(extra.path))) differences.push(`${key}: the extra procedure ${pathToKey(extra.path)}`);
      }
    }
    expect(differences).toEqual([]);
  }, 300000);

  it("has the procedures of the eager registry, in the same order, after loadAll()", async () => {
    const lazy = createLazyEcosystemRegistry(index, false, false);
    await lazy.loadAll();
    const keys = (registry: ProcedureRegistry): string[] => registry.getAll().map((procedure) => pathToKey(procedure.path));
    expect(keys(lazy)).toEqual(keys(eager));
  }, 120000);
});

/** The text that a command line prints on stdout and stderr. */
async function outputOf(argv: string[], ctx: ManifestContext): Promise<string> {
  const lines: string[] = [];
  const capture = (...args: unknown[]): void => {
    lines.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "info").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  });
  try {
    await executeArgs([...argv, "--local"], ctx);
  } finally {
    write.mockRestore();
    vi.restoreAllMocks();
  }
  return lines.join("\n");
}

describe("the lists in the lazy mode", () => {
  // The two modes of a run with a fresh manifest: the eager load of 0.16 and the lazy load of O93
  const eagerContext = (): ManifestContext => ({ commands: manifest.commands, verbose: false, load: () => initCli(false) });
  const lazyContext = (): ManifestContext => ({ commands: manifest.commands, verbose: false, load: () => initLazyCli(false, manifest.commands) });

  for (const argv of [["procedure", "list"], ["--format", "json", "procedure", "list"], ["--help"], ["git", "--help"], ["procedure", "list", "--help"]]) {
    it(`gives the same bytes for mark ${argv.join(" ")}`, async () => {
      const expected = await outputOf(argv, eagerContext());
      const actual = await outputOf(argv, lazyContext());
      expect(actual.length).toBeGreaterThan(0);
      expect(actual).toBe(expected);
    }, 120000);
  }

  it("loads only the packages of the path for one call", async () => {
    const ctx = await initLazyCli(false, manifest.commands);
    const registry = ctx.registry!;
    const before = ctx.procedures.length;
    await registry.resolve(["git", "status"]);
    // The procedures of the context are the procedures that have loaded at the time of the read
    const after = ctx.procedures.length;
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(registry.getAll().length);
    expect(after).toBeLessThan(eager.getAll().length);
    expect(registry.has(["mongo", "collections", "drop"])).toBe(false);
  });
});

describe("the index and the warnings of the lazy registry", () => {
  it("gives the index of an eager registry of mark, and no index for another registry", () => {
    expect(packageIndexOf(eager)).toEqual(index);
    expect(packageIndexOf(undefined)).toBeUndefined();
    expect(packageIndexOf(createLazyEcosystemRegistry({}, false, false, []))).toBeUndefined();
  });

  it("warns for a path that the index does not have, only when the warnings are on", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await createLazyEcosystemRegistry({}, false, false, []).resolve(["no", "such", "path"]);
    expect(warn).not.toHaveBeenCalled();
    await createLazyEcosystemRegistry({}, false, true, []).resolve(["no", "such", "path"]);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^mark: /);
  });
});
