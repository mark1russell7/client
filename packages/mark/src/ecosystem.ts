/**
 * Workspace-based Procedure Discovery
 *
 * Dynamically discovers and loads procedures from the packages of the
 * monorepo this CLI lives in. This enables the CLI to automatically find
 * all available procedures without hardcoding imports.
 *
 * Discovery flow:
 * 1. Walk up from this module to the folder that holds pnpm-workspace.yaml
 * 2. For each packages/* folder, read its package.json
 * 3. If it has client.procedures, dynamically import it
 * 4. The register.js entry of each package registers its procedures in PROCEDURE_REGISTRY
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PROCEDURE_REGISTRY,
  allCoreProcedures,
  clientModule,
  createRegistry,
  defineModule,
  pathToKey,
  registerModules,
  type AnyProcedure,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client";

// =============================================================================
// Types
// =============================================================================

interface PackageJson {
  name: string;
  client?: {
    procedures?: string;
  };
  exports?: Record<string, unknown>;
}

interface DiscoveredPackage {
  name: string;
  path: string;
  proceduresPath: string;
  /** The file of the side-effect-free `./module` entry, when the package has one (roadmap 3.1) */
  modulePath?: string | undefined;
}

/** The file of the `./module` export of a package, relative to the package folder. */
function moduleEntryOf(packageJson: PackageJson): string | undefined {
  const entry = packageJson.exports?.["./module"];
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const target = (entry as { import?: unknown; default?: unknown }).import ?? (entry as { default?: unknown }).default;
    return typeof target === "string" ? target : undefined;
  }
  return undefined;
}

// =============================================================================
// Discovery
// =============================================================================

/**
 * Read and parse JSON file
 */
function readJson<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Find the workspace root: the nearest folder above this module that holds pnpm-workspace.yaml
 */
export function findWorkspaceRoot(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Discover workspace packages that declare client.procedures
 */
export function discoverFromEcosystem(root: string | null = findWorkspaceRoot()): DiscoveredPackage[] {
  const discovered: DiscoveredPackage[] = [];

  if (!root) {
    // Not running from inside the monorepo, nothing to discover
    return discovered;
  }

  const packagesDir = path.join(root, "packages");
  const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const packageDir = path.join(packagesDir, entry.name);
    const packageJson = readJson<PackageJson>(path.join(packageDir, "package.json"));

    if (packageJson?.client?.procedures) {
      discovered.push({
        name: packageJson.name,
        path: packageDir,
        proceduresPath: packageJson.client.procedures,
        modulePath: moduleEntryOf(packageJson),
      });
    }
  }

  return discovered;
}

/**
 * This function registers all core procedures of `@procedures/client` in the global registry: the
 * control flow and `procedure.*` of `clientModule`, and the math, string, array, object, comparison
 * and type procedures (`client.add` and the others). An import registers none of them
 * (ARCHITECTURE-PROPOSALS-2026-10, P9). (Docs review DOC-6: before, `mark client add` was an
 * unknown command.) A procedure that is registered already stays.
 */
export function registerCoreProcedures(): number {
  let added = 0;
  for (const procedure of [...clientModule.procedures, ...allCoreProcedures]) {
    if (!PROCEDURE_REGISTRY.has(procedure.path)) {
      PROCEDURE_REGISTRY.register(procedure);
      added++;
    }
  }
  return added;
}

/**
 * Dynamically load procedures from discovered packages.
 *
 * A package that fails to load gives one warning line on stderr, also without `verbose`: before,
 * its commands were missing with no message (deep dive CLI-18). A package that is not built yet
 * (no procedures file) is reported only with `verbose`. `warn: false` turns the warnings off (the
 * build of mark writes the manifest while other packages can still be in their build).
 */
export async function loadEcosystemProcedures(verbose = false, warn = true): Promise<string[]> {
  registerCoreProcedures();
  const discovered = discoverFromEcosystem();
  const loaded: string[] = [];

  for (const pkg of discovered) {
    // Build the full path to the procedures file
    const proceduresFullPath = path.join(pkg.path, pkg.proceduresPath);

    // Check if file exists
    if (!fs.existsSync(proceduresFullPath)) {
      if (verbose) {
        console.warn(`Procedures file not found (build the package): ${proceduresFullPath}`);
      }
      continue;
    }

    try {
      // Dynamic import - the module will self-register procedures. pathToFileURL escapes
      // "#", "%" and spaces in the path (before, a string join broke such paths).
      await import(pathToFileURL(proceduresFullPath).href);

      loaded.push(pkg.name);

      if (verbose) {
        console.log(`Loaded procedures from: ${pkg.name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      if (warn) {
        console.warn(`mark: the procedures of ${pkg.name} did not load: ${message}`);
      }
      if (verbose && error instanceof Error && error.stack) {
        console.warn(error.stack);
      }
    }
  }

  return loaded;
}

/**
 * Get list of ecosystem packages that have procedures
 */
export function listEcosystemProcedurePackages(): Array<{ name: string; path: string }> {
  return discoverFromEcosystem().map((pkg) => ({
    name: pkg.name,
    path: pkg.path,
  }));
}

/** The core procedures that `mark` serves: all of them, also the ones that the core import does not register. */
const allCoreModule: ProcedureModule = defineModule("@procedures/client (all core procedures)", allCoreProcedures);

/** The registry of `mark` and the names of the packages that it holds. */
export interface EcosystemRegistry {
  registry: ProcedureRegistry;
  loaded: string[];
  /** The absolute path of the root of the files (`--fs-root`), or undefined. */
  fsRoot?: string | undefined;
  /** The keys of the procedures that the root refuses, or undefined without a root. */
  refusedUnderRoot?: string[] | undefined;
}

/** The options of `loadEcosystemRegistry()`. */
export interface EcosystemOptions {
  /**
   * The root of the files (`--fs-root`, roadmap R33). Each procedure keeps its paths in the root,
   * also in the nested calls, or the root refuses it (`confineToRoot()` of `@procedures/fs`).
   */
  fsRoot?: string | undefined;
}

/** The function of `@procedures/fs` that confines each procedure of a registry to a root. */
type ConfineToRoot = (registry: ProcedureRegistry, root: string) => { root: string; refused: string[] };

/**
 * This function confines each procedure of the registry to a root, with `confineToRoot()` of the
 * workspace package `@procedures/fs`. Without that package, it throws: a root that does not apply
 * is an error, not a silent no-op.
 */
async function confineRoot(
  registry: ProcedureRegistry,
  root: string,
  discovered: readonly DiscoveredPackage[],
): Promise<{ root: string; refused: string[] }> {
  const fsPackage = discovered.find((pkg) => pkg.name === "@procedures/fs");
  const file = fsPackage?.modulePath ? path.join(fsPackage.path, fsPackage.modulePath) : undefined;
  if (!file || !fs.existsSync(file)) {
    throw new Error("--fs-root needs the package @procedures/fs of the workspace: build packages/client-fs");
  }
  const { confineToRoot } = (await import(pathToFileURL(file).href)) as { confineToRoot?: ConfineToRoot };
  if (typeof confineToRoot !== "function") throw new Error("--fs-root needs a build of @procedures/fs with confineToRoot");
  const { root: folder, refused } = confineToRoot(registry, root);
  return { root: folder, refused };
}

/**
 * The module of a package: its `./module` entry (it registers nothing), or else the procedures
 * that importing its procedures file adds to the global registry (a package of the old kind).
 */
async function moduleOfPackage(pkg: DiscoveredPackage): Promise<ProcedureModule | undefined> {
  if (pkg.modulePath) {
    const file = path.join(pkg.path, pkg.modulePath);
    if (fs.existsSync(file)) {
      const exports = (await import(pathToFileURL(file).href)) as { default?: ProcedureModule };
      if (exports.default && Array.isArray(exports.default.procedures)) return exports.default;
    }
  }
  const proceduresFile = path.join(pkg.path, pkg.proceduresPath);
  if (!fs.existsSync(proceduresFile)) return undefined;
  const before = new Set(PROCEDURE_REGISTRY.getAll().map((procedure) => pathToKey(procedure.path)));
  await import(pathToFileURL(proceduresFile).href);
  const added: AnyProcedure[] = PROCEDURE_REGISTRY.getAll().filter((procedure) => !before.has(pathToKey(procedure.path)));
  return { name: pkg.name, procedures: added };
}

/**
 * The registry of `mark` (roadmap 3.1): a registry of its own, built from the module of each
 * workspace package that declares `client.procedures`, with all the core procedures. The global
 * registry does not change for a package with a module entry. A package that fails to load gives
 * one warning line on stderr, as with `loadEcosystemProcedures()`. With `options.fsRoot`, each
 * procedure keeps its paths in the root, or the root refuses it (`confineToRoot()`).
 */
export async function loadEcosystemRegistry(verbose = false, warn = true, options: EcosystemOptions = {}): Promise<EcosystemRegistry> {
  const registry = createRegistry(allCoreModule);
  const loaded: string[] = [];
  const discovered = discoverFromEcosystem();
  for (const pkg of discovered) {
    try {
      const module = await moduleOfPackage(pkg);
      if (!module) {
        if (verbose) console.warn(`Procedures file not found (build the package): ${path.join(pkg.path, pkg.proceduresPath)}`);
        continue;
      }
      registerModules(registry, [module]);
      loaded.push(pkg.name);
      if (verbose) console.log(`Loaded procedures from: ${pkg.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      if (warn) console.warn(`mark: the procedures of ${pkg.name} did not load: ${message}`);
      if (verbose && error instanceof Error && error.stack) console.warn(error.stack);
    }
  }
  if (options.fsRoot === undefined) return { registry, loaded };
  // After the last package: each procedure of the registry gets the rules of the root
  const { root: fsRoot, refused } = await confineRoot(registry, options.fsRoot, discovered);
  return { registry, loaded, fsRoot, refusedUnderRoot: refused };
}
