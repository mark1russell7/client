#!/usr/bin/env node
/**
 * The wraps of the homes (direction 40). A wrap package has the procedures of one home: a general
 * package of the map of homes, from npm. Its file `wrap.json` names the home, the entry, the
 * namespace, the manifest file and the overlay.
 *
 * - `generate` writes the manifest of each wrap package from the types of its home. It also raises
 *   the ratchet of `wraps.coverage.json`, and it never lowers it.
 * - `check` fails when a manifest is not the manifest that the generator gives now: then a function
 *   of the home has no procedure and no exemption. It also fails when the share of the functions
 *   with a procedure falls below the ratchet of its home.
 *
 * A wrap with `"pure": true` in its `wrap.json` has more checks (the gate of kind 1):
 *
 * - Each of its procedures has no effect: it reads nothing and writes nothing.
 * - The field `client.browser` of its package lists `.`, `./module` and `./register`.
 * - At least one program of `wraps.programs.json` calls one of its procedures.
 *
 * The programs of `wraps.programs.json` call only the procedures of the pure wraps, also across
 * libraries. The script starts each program two times, on the manifests of now. The two results
 * must be equal. `generate` records the result, and `check` fails when it changes.
 *
 * To lower a ratchet, edit `wraps.coverage.json` and give the reason in the pull request.
 * Start the script after the build: the generator is `packages/compiler/dist/generate.js`.
 * With `--package`, the script does not start the programs.
 *
 * Run: node scripts/wraps.ts generate|check [--package <folder>]
 */

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { root, workspacePackages } from "./lib/workspace.ts";

/** The file `wrap.json` of a wrap package. */
export interface Wrap {
  /** The npm name of the home, for example `@mark1russell7/rigor-statistics`. */
  readonly home: string;
  /** The entry of the home. The default is `.`. */
  readonly entry?: string;
  /** The first segments of the path of each procedure, for example `["statistics"]`. */
  readonly namespace: readonly string[];
  /** The manifest file, from the folder of the package. */
  readonly manifest: string;
  /** The data that the types cannot tell: the effects, and the functions to exempt. */
  readonly overlay?: Record<string, unknown>;
  /** True for a wrap of kind 1 with no effects: the script applies the checks of a pure wrap. */
  readonly pure?: boolean;
}

/** A program of `wraps.programs.json`: calls of the procedures of the pure wraps, as data. */
export interface WrapProgram {
  readonly name: string;
  readonly description?: string;
  /** The root call. The calls in its input start first. */
  readonly program: { readonly $proc: readonly string[]; readonly input?: unknown };
  /** The result that `generate` recorded. */
  readonly result?: unknown;
}

/** The two results of a program, or its error. */
export type ProgramRun = { readonly first: unknown; readonly second: unknown } | { readonly error: string };

/** The counts of one home in the ratchet file. */
export interface Coverage {
  readonly procedures: number;
  readonly functions: number;
}

/** The fields of a procedure of a manifest that the script reads. */
interface ManifestProcedure {
  readonly name: string;
  readonly effects?: { readonly reads?: readonly string[]; readonly writes?: readonly string[] };
}

/** The manifest fields that the script reads. */
interface Manifest {
  readonly package: string;
  readonly version?: string;
  readonly procedures: readonly ManifestProcedure[];
  readonly exempt: readonly unknown[];
}

type Generate = (options: {
  declarations: string;
  package: string;
  version?: string;
  entry?: string;
  namespace: readonly string[];
  overlay?: Record<string, unknown>;
}) => Manifest;

const RATCHET = join(root, "wraps.coverage.json");
const PROGRAMS = join(root, "wraps.programs.json");
/** The entries of a package that runs in a browser. */
const BROWSER_ENTRIES = [".", "./module", "./register"];

/**
 * The declaration file of an entry of the exports map of a package: the `types` condition, or the
 * `types` of its `import` or `default` condition.
 */
export function typesOf(target: unknown): string | undefined {
  if (typeof target === "string") return target.endsWith(".d.ts") || target.endsWith(".d.mts") ? target : undefined;
  if (target === null || typeof target !== "object") return undefined;
  const conditions = target as Record<string, unknown>;
  return typesOf(conditions["types"]) ?? typesOf(conditions["import"]) ?? typesOf(conditions["default"]);
}

/** The declaration file of the entry of a package, from its manifest. */
export function declarationsOf(manifest: Record<string, unknown>, entry: string): string | undefined {
  const exportsMap = manifest["exports"];
  if (exportsMap !== undefined && exportsMap !== null && typeof exportsMap === "object") {
    const map = exportsMap as Record<string, unknown>;
    const keyed = Object.keys(map).some((key) => key.startsWith("."));
    const target = keyed ? map[entry] : entry === "." ? map : undefined;
    const found = typesOf(target);
    if (found !== undefined || keyed) return found;
  }
  if (entry !== ".") return undefined;
  const types = manifest["types"] ?? manifest["typings"];
  return typeof types === "string" ? types : undefined;
}

/** The JavaScript file of an entry of the exports map: the `import`, `node` or `default` condition. */
export function importOf(target: unknown): string | undefined {
  if (typeof target === "string") return /\.d\.[cm]?ts$/.test(target) ? undefined : target;
  if (target === null || typeof target !== "object") return undefined;
  const conditions = target as Record<string, unknown>;
  return importOf(conditions["import"]) ?? importOf(conditions["node"]) ?? importOf(conditions["default"]);
}

/** The JavaScript file of the entry of a package, from its manifest. */
export function entryFileOf(manifest: Record<string, unknown>, entry: string): string | undefined {
  const exportsMap = manifest["exports"];
  if (exportsMap !== undefined && exportsMap !== null && typeof exportsMap === "object") {
    const map = exportsMap as Record<string, unknown>;
    const keyed = Object.keys(map).some((key) => key.startsWith("."));
    return importOf(keyed ? map[entry] : entry === "." ? map : undefined);
  }
  if (entry !== ".") return undefined;
  const main = manifest["module"] ?? manifest["main"];
  return typeof main === "string" ? main : undefined;
}

/** The problems of a pure wrap: a procedure with an effect, and a browser entry that is not listed. */
export function pureProblems(dir: string, manifest: Pick<Manifest, "procedures">, packageJson: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const procedure of manifest.procedures) {
    const effects = procedure.effects;
    if (effects === undefined || (effects.reads?.length ?? 0) > 0 || (effects.writes?.length ?? 0) > 0) {
      problems.push(`packages/${dir}: the procedure ${procedure.name} has an effect, but wrap.json says that the wrap is pure`);
    }
  }
  const client = packageJson["client"] as { browser?: unknown } | undefined;
  const browser = Array.isArray(client?.browser) ? (client.browser as unknown[]) : [];
  for (const entry of BROWSER_ENTRIES) {
    if (!browser.includes(entry)) problems.push(`packages/${dir}: client.browser of package.json does not list ${entry}. A pure wrap runs in a browser`);
  }
  return problems;
}

/** The path of each call in a value, in the order of a walk. The value of a `$literal` is data. */
export function callPaths(value: unknown): string[][] {
  const paths: string[][] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const object = node as Record<string, unknown>;
    if ("$literal" in object) return;
    const path = object["$proc"];
    if (Array.isArray(path) && path.every((segment) => typeof segment === "string")) paths.push(path as string[]);
    for (const [key, item] of Object.entries(object)) if (key !== "$proc") visit(item);
  };
  visit(value);
  return paths;
}

function startsWith(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

/**
 * The problems of the use of the pure wraps by the programs: a program with no name or the name
 * of another program, a call outside the pure wraps, and a pure wrap that no program uses.
 */
export function programUseProblems(programs: readonly WrapProgram[], wraps: readonly { readonly dir: string; readonly namespace: readonly string[] }[]): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  const used = new Set<string>();
  for (const program of programs) {
    if (typeof program.name !== "string" || program.name === "") problems.push("wraps.programs.json: a program has no name");
    else if (names.has(program.name)) problems.push(`wraps.programs.json: two programs have the name ${program.name}`);
    names.add(program.name);
    const paths = callPaths(program.program);
    if (paths.length === 0) problems.push(`wraps.programs.json: the program ${program.name} has no call`);
    for (const path of paths) {
      const wrap = wraps.find((candidate) => startsWith(path, candidate.namespace));
      if (wrap === undefined) problems.push(`wraps.programs.json: the program ${program.name} calls ${path.join(".")}, which is not a procedure of a pure wrap`);
      else used.add(wrap.dir);
    }
  }
  for (const wrap of wraps) {
    if (!used.has(wrap.dir)) problems.push(`packages/${wrap.dir}: no program of wraps.programs.json calls a procedure of the pure wrap`);
  }
  return problems;
}

/**
 * The problems of the run of a program: an error, two results that differ, and, with `recorded`,
 * a result that is not the recorded result.
 */
export function runProblems(program: WrapProgram, run: ProgramRun, recorded: boolean): string[] {
  if ("error" in run) return [`wraps.programs.json: the program ${program.name} fails: ${run.error}`];
  if (!isDeepStrictEqual(run.first, run.second)) return [`wraps.programs.json: the program ${program.name} gives two different results in two runs`];
  if (!recorded) return [];
  if (!("result" in program)) return [`wraps.programs.json: the program ${program.name} has no recorded result. Start node scripts/wraps.ts generate`];
  if (!isDeepStrictEqual(run.first, program.result)) {
    return [`wraps.programs.json: the program ${program.name} gives ${JSON.stringify(run.first)}, not the recorded result ${JSON.stringify(program.result)}`];
  }
  return [];
}

/** The key of a home in the ratchet file: the package, and the entry when it is not `.`. */
export function coverageKey(wrap: Wrap): string {
  const entry = wrap.entry ?? ".";
  return entry === "." ? wrap.home : `${wrap.home}/${entry.replace(/^\.\//, "")}`;
}

/** True when the share of `now` is below the share of `ratchet`. */
export function isBelow(now: Coverage, ratchet: Coverage): boolean {
  return now.procedures * ratchet.functions < ratchet.procedures * now.functions;
}

/** The coverage of a manifest. */
export function coverageOf(manifest: { readonly package?: string; readonly procedures: readonly unknown[]; readonly exempt: readonly unknown[] }): Coverage {
  return { procedures: manifest.procedures.length, functions: manifest.procedures.length + manifest.exempt.length };
}

/** The source text of a manifest file. */
export function manifestSource(manifest: Manifest): string {
  const version = manifest.version !== undefined ? ` ${manifest.version}` : "";
  return [
    `// The manifest of ${manifest.package}${version}, made from its types by \`node scripts/wraps.ts generate\`. Do not edit it.`,
    `import type { ExportsManifest } from "@procedures/compiler";`,
    "",
    `export const manifest: ExportsManifest = ${JSON.stringify(manifest, null, 2)};`,
    "",
  ].join("\n");
}

interface WrapPackage {
  readonly dir: string;
  readonly path: string;
  readonly wrap: Wrap;
  readonly packageJson: Record<string, unknown>;
}

function wrapPackages(only: string | undefined): WrapPackage[] {
  return workspacePackages()
    .filter(({ dir, path }) => existsSync(join(path, "wrap.json")) && (only === undefined || dir === only))
    .map(({ dir, path, manifest }) => ({
      dir,
      path,
      packageJson: manifest as Record<string, unknown>,
      wrap: JSON.parse(readFileSync(join(path, "wrap.json"), "utf8")) as Wrap,
    }));
}

function homeDirOf(pkg: WrapPackage): string {
  return join(pkg.path, "node_modules", ...pkg.wrap.home.split("/"));
}

function manifestOf(generate: Generate, pkg: WrapPackage): Manifest {
  const homeDir = homeDirOf(pkg);
  const homeManifest = JSON.parse(readFileSync(join(homeDir, "package.json"), "utf8")) as Record<string, unknown>;
  const entry = pkg.wrap.entry ?? ".";
  const declarations = declarationsOf(homeManifest, entry);
  if (declarations === undefined) throw new Error(`packages/${pkg.dir}: ${pkg.wrap.home} has no declaration file for the entry ${entry}`);
  return generate({
    declarations: join(homeDir, declarations),
    package: pkg.wrap.home,
    ...(typeof homeManifest["version"] === "string" ? { version: homeManifest["version"] } : {}),
    entry,
    namespace: pkg.wrap.namespace,
    ...(pkg.wrap.overlay !== undefined ? { overlay: pkg.wrap.overlay } : {}),
  });
}

function readRatchet(): Record<string, Coverage> {
  return existsSync(RATCHET) ? (JSON.parse(readFileSync(RATCHET, "utf8")) as Record<string, Coverage>) : {};
}

function readPrograms(): WrapProgram[] {
  if (!existsSync(PROGRAMS)) return [];
  return (JSON.parse(readFileSync(PROGRAMS, "utf8")) as { programs: WrapProgram[] }).programs;
}

interface ClientApi {
  readonly ProcedureRegistry: new () => unknown;
  readonly registerModules: (registry: unknown, modules: readonly unknown[]) => void;
  readonly Client: new (options: { transport: unknown }) => {
    useRegistry(registry: unknown): { exec(path: readonly string[], input: unknown): Promise<unknown> };
  };
}

interface PureWrap {
  readonly pkg: WrapPackage;
  readonly manifest: Manifest;
}

/**
 * This function gives the two runs of each program on the pure wraps. Each module comes from a
 * manifest of now and the functions of its home, so the runs need no build of the wrap packages.
 */
async function runPrograms(wraps: readonly PureWrap[], programs: readonly WrapProgram[]): Promise<ProgramRun[]> {
  const api = (await import(pathToFileURL(join(root, "packages", "client", "dist", "index.js")).href)) as ClientApi;
  const { exportsModule } = (await import(pathToFileURL(join(root, "packages", "compiler", "dist", "index.js")).href)) as {
    exportsModule: (manifest: Manifest, functions: unknown, options: { name: string }) => unknown;
  };
  const modules: unknown[] = [];
  for (const { pkg, manifest } of wraps) {
    const homeDir = homeDirOf(pkg);
    const homeManifest = JSON.parse(readFileSync(join(homeDir, "package.json"), "utf8")) as Record<string, unknown>;
    const entryFile = entryFileOf(homeManifest, pkg.wrap.entry ?? ".");
    if (entryFile === undefined) throw new Error(`packages/${pkg.dir}: ${pkg.wrap.home} has no JavaScript file for the entry ${pkg.wrap.entry ?? "."}`);
    const functions = await import(pathToFileURL(join(homeDir, entryFile)).href);
    modules.push(exportsModule(manifest, functions, { name: String(pkg.packageJson["name"]) }));
  }
  const registry = new api.ProcedureRegistry();
  api.registerModules(registry, modules);
  // A program runs in this process: the client never uses the transport
  const transport = { name: "none", send: async function* () {}, close: async () => {} };
  const client = new api.Client({ transport }).useRegistry(registry);
  // A result goes through JSON, as the result of a call of a host does
  const once = async (program: WrapProgram): Promise<unknown> =>
    JSON.parse(JSON.stringify((await client.exec(program.program.$proc, program.program.input)) ?? null)) as unknown;
  const runs: ProgramRun[] = [];
  for (const program of programs) {
    try {
      runs.push({ first: await once(program), second: await once(program) });
    } catch (error) {
      runs.push({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  return runs;
}

async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  const at = argv.indexOf("--package");
  const only = at >= 0 ? argv[at + 1] : undefined;
  if (command !== "generate" && command !== "check") {
    console.error("Usage: node scripts/wraps.ts generate|check [--package <folder>]");
    return 2;
  }
  const generatorFile = join(root, "packages", "compiler", "dist", "generate.js");
  if (!existsSync(generatorFile)) {
    console.error("packages/compiler/dist/generate.js is missing: build @procedures/compiler first");
    return 2;
  }
  const { generateExportsManifest } = (await import(pathToFileURL(generatorFile).href)) as { generateExportsManifest: Generate };
  const packages = wrapPackages(only);
  const ratchet = readRatchet();
  const problems: string[] = [];
  const pure: PureWrap[] = [];
  for (const pkg of packages) {
    const manifest = manifestOf(generateExportsManifest, pkg);
    if (pkg.wrap.pure === true) {
      pure.push({ pkg, manifest });
      problems.push(...pureProblems(pkg.dir, manifest, pkg.packageJson));
    }
    const file = join(pkg.path, pkg.wrap.manifest);
    const source = manifestSource(manifest);
    const now = coverageOf(manifest);
    const key = coverageKey(pkg.wrap);
    const before = ratchet[key];
    const share = `${now.procedures} of ${now.functions}`;
    if (command === "generate") {
      writeFileSync(file, source);
      if (before === undefined || isBelow(before, now)) ratchet[key] = now;
      console.log(`packages/${pkg.dir}: ${key}, ${share} functions have a procedure`);
      continue;
    }
    const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== source) {
      problems.push(`packages/${pkg.dir}: ${pkg.wrap.manifest} is not the manifest of ${key} now. Start node scripts/wraps.ts generate`);
    }
    if (before === undefined) problems.push(`packages/${pkg.dir}: wraps.coverage.json has no ratchet for ${key}. Start node scripts/wraps.ts generate`);
    else if (isBelow(now, before)) {
      problems.push(`packages/${pkg.dir}: ${key} has ${share} functions with a procedure, below the ratchet of ${before.procedures} of ${before.functions}`);
    } else console.log(`packages/${pkg.dir}: ${key}, ${share} functions have a procedure`);
  }
  const programs = only === undefined ? readPrograms() : [];
  if (only === undefined) {
    problems.push(...programUseProblems(programs, pure.map(({ pkg }) => ({ dir: pkg.dir, namespace: pkg.wrap.namespace }))));
    const runs = programs.length > 0 ? await runPrograms(pure, programs) : [];
    programs.forEach((program, index) => problems.push(...runProblems(program, runs[index]!, command === "check")));
    if (command === "generate" && programs.length > 0) {
      const recorded = programs.map((program, index) => {
        const run = runs[index]!;
        return "error" in run ? program : { ...program, result: run.first };
      });
      writeFileSync(PROGRAMS, `${JSON.stringify({ programs: recorded }, null, 2)}\n`);
    }
    console.log(`${programs.length} programs on ${pure.length} pure wraps`);
  }
  if (command === "generate") {
    const sorted = Object.fromEntries(Object.entries(ratchet).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    writeFileSync(RATCHET, `${JSON.stringify(sorted, null, 2)}\n`);
    for (const problem of problems) console.error(problem);
    return problems.length === 0 ? 0 : 1;
  }
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log(`The ${packages.length} wrap packages are current, and no coverage fell.`);
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
