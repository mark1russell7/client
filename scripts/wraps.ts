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
 * To lower a ratchet, edit `wraps.coverage.json` and give the reason in the pull request.
 * Start the script after the build: the generator is `packages/compiler/dist/generate.js`.
 *
 * Run: node scripts/wraps.ts generate|check [--package <folder>]
 */

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { root, workspacePackages } from "./lib/workspace.mjs";

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
}

/** The counts of one home in the ratchet file. */
export interface Coverage {
  readonly procedures: number;
  readonly functions: number;
}

/** The manifest fields that the script reads. */
interface Manifest {
  readonly package: string;
  readonly version?: string;
  readonly procedures: readonly unknown[];
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
export function coverageOf(manifest: Manifest): Coverage {
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
}

function wrapPackages(only: string | undefined): WrapPackage[] {
  return workspacePackages()
    .filter(({ dir, path }) => existsSync(join(path, "wrap.json")) && (only === undefined || dir === only))
    .map(({ dir, path }) => ({ dir, path, wrap: JSON.parse(readFileSync(join(path, "wrap.json"), "utf8")) as Wrap }));
}

function manifestOf(generate: Generate, pkg: WrapPackage): Manifest {
  const homeDir = join(pkg.path, "node_modules", ...pkg.wrap.home.split("/"));
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
  for (const pkg of packages) {
    const manifest = manifestOf(generateExportsManifest, pkg);
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
  if (command === "generate") {
    const sorted = Object.fromEntries(Object.entries(ratchet).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    writeFileSync(RATCHET, `${JSON.stringify(sorted, null, 2)}\n`);
    return 0;
  }
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log(`The ${packages.length} wrap packages are current, and no coverage fell.`);
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
