/**
 * Procedure Discovery
 *
 * Generates a TypeScript file with static imports for all discovered procedures.
 *
 * Fast path: Reads from .client-registry.json (populated by `client announce`)
 * Fallback: Scans node_modules for packages with `client.procedures`
 *
 * This is compile-time discovery - the generated file contains static imports
 * that get compiled/bundled with your application.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { watch } from "node:fs";
import { getRegistry, REGISTRY_FILENAME } from "./announce.js";

// =============================================================================
// Types
// =============================================================================

export interface DiscoverOptions {
  /** Output file path */
  output: string;
  /** Root directory to scan from */
  root: string;
  /** Watch mode for development */
  watch: boolean;
  /** Check if generated file is up-to-date (CI mode) */
  check: boolean;
  /** Verbose logging */
  verbose: boolean;
}

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: unknown;
  client?: {
    procedures?: string;
  };
}

/** A package that declares procedures. */
export interface DiscoveredPackage {
  name: string;
  proceduresPath: string;
  /** The module specifier that the generated file imports */
  importPath: string;
}

/** The string targets of an exports value: a string, an array, or the leaves of conditions. */
function exportTargets(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (value && typeof value === "object") return Object.values(value).flatMap(exportTargets);
  return [];
}

/**
 * The specifier that imports the procedures file of a package. With an `exports` map, a bare
 * `pkg/dist/register.js` import fails unless the map exports that path: the function looks for
 * the subpath (also a `./*` pattern) whose target is the file. When the map has none, it
 * imports the package root, which registers the procedures of the packages of this repository.
 * (Before, the generated import ignored the map, and failed: deep dive CORE-17.)
 *
 * @param name - Package name
 * @param manifest - The package.json of the package
 * @param proceduresPath - The `client.procedures` field
 * @returns The module specifier for the generated import
 */
export function procedureImportPath(name: string, manifest: { exports?: unknown }, proceduresPath: string): string {
  const file = "./" + proceduresPath.replace(/^\.\//, "");
  if (manifest.exports === undefined) {
    return `${name}/${file.slice(2)}`;
  }
  const exportsMap =
    typeof manifest.exports === "string" || Array.isArray(manifest.exports) ||
    !Object.keys(manifest.exports as object).some((key) => key.startsWith("."))
      ? { ".": manifest.exports }
      : (manifest.exports as Record<string, unknown>);

  for (const [subpath, value] of Object.entries(exportsMap)) {
    for (const target of exportTargets(value)) {
      if (!subpath.includes("*")) {
        if (target === file) return subpath === "." ? name : `${name}/${subpath.slice(2)}`;
        continue;
      }
      // A pattern: "./*" -> "./dist/*.js"
      const [before, after] = target.split("*") as [string, string | undefined];
      if (after === undefined || !file.startsWith(before) || !file.endsWith(after)) continue;
      const star = file.slice(before.length, file.length - after.length);
      return `${name}/${subpath.replace("*", star).slice(2)}`;
    }
  }
  return name;
}

// =============================================================================
// Discovery
// =============================================================================

/**
 * Discover packages with procedure declarations: the dependencies of the root package and
 * their dependencies, in `node_modules`.
 *
 * @param rootDir - The folder of the root package.json
 * @param verbose - Log each package
 * @returns The packages that declare procedures, sorted by name
 */
export async function discoverPackages(
  rootDir: string,
  verbose: boolean
): Promise<DiscoveredPackage[]> {
  const discovered: DiscoveredPackage[] = [];
  const scanned = new Set<string>();

  // Read root package.json
  const rootPkgPath = path.join(rootDir, "package.json");
  let rootPkg: PackageJson;

  try {
    const content = await fs.readFile(rootPkgPath, "utf-8");
    rootPkg = JSON.parse(content);
  } catch {
    throw new Error(`Could not read package.json at ${rootPkgPath}`);
  }

  // Get all dependencies to scan
  const depsToScan = [
    ...Object.keys(rootPkg.dependencies ?? {}),
    ...Object.keys(rootPkg.devDependencies ?? {}),
  ];

  if (verbose) {
    console.log(`Scanning ${depsToScan.length} dependencies...`);
  }

  // Scan each dependency
  async function scanPackage(packageName: string, nodeModulesPath: string): Promise<void> {
    if (scanned.has(packageName)) return;

    const pkgDir = path.join(nodeModulesPath, packageName);
    const pkgJsonPath = path.join(pkgDir, "package.json");

    let pkg: PackageJson;
    try {
      const content = await fs.readFile(pkgJsonPath, "utf-8");
      pkg = JSON.parse(content);
    } catch {
      // Package doesn't exist at this path (might be hoisted differently). It is not scanned
      // yet: the next location can have it. (Before, the name was marked as scanned before
      // the read, so a hoisted transitive package was skipped: deep dive CORE-17.)
      return;
    }
    scanned.add(packageName);

    // Check if this package declares procedures
    if (pkg.client?.procedures) {
      const proceduresPath = pkg.client.procedures;

      // Verify the file exists
      const fullPath = path.join(pkgDir, proceduresPath);
      try {
        await fs.access(fullPath);
        discovered.push({
          name: packageName,
          proceduresPath,
          importPath: procedureImportPath(packageName, pkg, proceduresPath),
        });

        if (verbose) {
          console.log(`  Found: ${packageName} -> ${proceduresPath}`);
        }
      } catch {
        console.warn(`  Warning: ${packageName} declares procedures at ${proceduresPath} but file not found`);
      }
    }

    // Recursively scan this package's dependencies
    const subDeps = Object.keys(pkg.dependencies ?? {});
    for (const subDep of subDeps) {
      // Try local node_modules first, then parent
      await scanPackage(subDep, path.join(pkgDir, "node_modules"));
      await scanPackage(subDep, nodeModulesPath);
    }
  }

  // Scan all dependencies
  const nodeModulesPath = path.join(rootDir, "node_modules");
  for (const dep of depsToScan) {
    await scanPackage(dep, nodeModulesPath);
  }

  // Sort for deterministic output
  discovered.sort((a, b) => a.name.localeCompare(b.name));

  return discovered;
}

// =============================================================================
// Code Generation
// =============================================================================

/**
 * Generate the TypeScript file content.
 *
 * @param packages - The discovered packages
 * @returns The file content: one side-effect import for each package
 */
export function generateCode(packages: DiscoveredPackage[]): string {
  const timestamp = new Date().toISOString();
  const imports = packages
    .map((p) => `import "${p.importPath}";`)
    .join("\n");

  const packageList = packages.map((p) => `  "${p.name}",`).join("\n");

  return `/**
 * Auto-generated procedure imports
 *
 * DO NOT EDIT - This file is generated by \`npx client discover\`
 * Generated at: ${timestamp}
 *
 * Import this file at your app's entry point to register all procedures
 * from your dependencies.
 */

// Side-effect imports that register procedures
${imports || "// No packages with procedures found"}

/**
 * List of packages that were discovered and imported.
 */
export const discoveredPackages = [
${packageList || "  // No packages with procedures found"}
] as const;

/**
 * Number of packages with procedures.
 */
export const packageCount = ${packages.length};
`;
}

// =============================================================================
// Main
// =============================================================================

/**
 * Try to load packages from registry (fast path).
 * Returns null if registry doesn't exist or is empty.
 */
async function loadFromRegistry(
  rootDir: string,
  verbose: boolean
): Promise<DiscoveredPackage[] | null> {
  try {
    const registry = await getRegistry(rootDir);

    if (Object.keys(registry.packages).length === 0) {
      return null;
    }

    const packages: DiscoveredPackage[] = [];

    for (const [name, entry] of Object.entries(registry.packages)) {
      // The exports map of the installed package decides the import path
      let manifest: { exports?: unknown } = {};
      try {
        manifest = JSON.parse(await fs.readFile(path.join(rootDir, "node_modules", name, "package.json"), "utf-8"));
      } catch {
        // Not installed at the root: import the declared file
      }
      packages.push({
        name,
        proceduresPath: entry.proceduresPath,
        importPath: procedureImportPath(name, manifest, entry.proceduresPath),
      });
    }

    // Sort for deterministic output
    packages.sort((a, b) => a.name.localeCompare(b.name));

    if (verbose) {
      console.log(`Loaded ${packages.length} package(s) from ${REGISTRY_FILENAME}`);
    }

    return packages;
  } catch {
    return null;
  }
}

/**
 * Run procedure discovery.
 */
export async function discover(options: DiscoverOptions): Promise<void> {
  const { output, root, watch: watchMode, check, verbose } = options;

  async function runDiscovery(): Promise<string> {
    if (verbose) {
      console.log(`Discovering procedures in ${root}...`);
    }

    // Try registry first (fast path)
    let packages = await loadFromRegistry(root, verbose);

    if (packages === null) {
      // Fallback to scanning
      if (verbose) {
        console.log(`No registry found, scanning node_modules...`);
      }
      packages = await discoverPackages(root, verbose);
    }

    const code = generateCode(packages);

    console.log(`Discovered ${packages.length} package(s) with procedures`);

    return code;
  }

  // Run initial discovery
  const code = await runDiscovery();

  // Resolve output path
  const outputPath = path.isAbsolute(output) ? output : path.join(root, output);
  const outputDir = path.dirname(outputPath);

  if (check) {
    // Check mode: verify the file is up-to-date
    try {
      const existing = await fs.readFile(outputPath, "utf-8");
      // Compare ignoring the timestamp line
      const normalizeForCompare = (s: string) =>
        s.replace(/Generated at: .+/, "Generated at: <timestamp>");

      if (normalizeForCompare(existing) !== normalizeForCompare(code)) {
        console.error("Generated file is out of date!");
        console.error(`Run \`npx client discover\` to update ${output}`);
        process.exit(1);
      }

      console.log("Generated file is up-to-date");
      return;
    } catch {
      console.error(`Generated file does not exist: ${output}`);
      console.error(`Run \`npx client discover\` to generate it`);
      process.exit(1);
    }
  }

  // Write the file
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, code, "utf-8");
  console.log(`Generated: ${output}`);

  if (watchMode) {
    // Watch mode: re-run on package.json changes
    console.log("\nWatching for changes...");
    console.log("Press Ctrl+C to stop\n");

    const pkgJsonPath = path.join(root, "package.json");
    const nodeModulesPath = path.join(root, "node_modules");

    // Watch package.json
    watch(pkgJsonPath, async () => {
      console.log("\npackage.json changed, re-discovering...");
      const newCode = await runDiscovery();
      await fs.writeFile(outputPath, newCode, "utf-8");
      console.log(`Updated: ${output}`);
    });

    // Watch node_modules (for package.json files inside)
    // This is a simplified watch - in production you might use chokidar
    watch(nodeModulesPath, { recursive: true }, async (_, filename) => {
      if (filename?.endsWith("package.json")) {
        console.log("\nDependency changed, re-discovering...");
        const newCode = await runDiscovery();
        await fs.writeFile(outputPath, newCode, "utf-8");
        console.log(`Updated: ${output}`);
      }
    });

    // Keep process alive
    await new Promise(() => {});
  }
}
