/**
 * Procedure Announcement (Self-Registration)
 *
 * When a package with procedures is installed, it "announces" itself
 * by writing to a registry file at the root of the project.
 *
 * This enables true bottom-up propagation:
 * - Each package with procedures has `"postinstall": "client announce"`
 * - On install, it walks up to find the root and registers itself
 * - `client discover` reads this registry instead of scanning
 *
 * The registry file (.client-registry.json) accumulates entries from
 * all packages as they're installed, making discovery instant.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// =============================================================================
// Types
// =============================================================================

export interface AnnounceOptions {
  /** Be verbose about what's happening */
  verbose: boolean;
}

interface RegistryEntry {
  /** Path to procedures file relative to package */
  proceduresPath: string;
  /** When this entry was added */
  registeredAt: string;
  /** Package version */
  version?: string;
}

interface Registry {
  /** Schema version for future compatibility */
  schemaVersion: 1;
  /** Map of package name to registry entry */
  packages: Record<string, RegistryEntry>;
}

interface PackageJson {
  name: string;
  version?: string;
  client?: {
    procedures?: string;
  };
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Find the root of the project (topmost directory with package.json that isn't in node_modules).
 */
async function findProjectRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  let lastValidRoot: string | null = null;

  while (true) {
    const pkgPath = path.join(current, "package.json");

    try {
      await fs.access(pkgPath);

      // Check if we're inside node_modules
      const isInNodeModules = current.includes("node_modules");

      if (!isInNodeModules) {
        // This is a valid root candidate
        lastValidRoot = current;
      }
    } catch {
      // No package.json here
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root
      break;
    }
    current = parent;
  }

  return lastValidRoot;
}

/**
 * Find the package that contains the current directory.
 * This is the package that depends on client and is being installed.
 */
async function findContainingPackage(startDir: string): Promise<{ dir: string; pkg: PackageJson } | null> {
  let current = path.resolve(startDir);

  while (true) {
    const pkgPath = path.join(current, "package.json");

    try {
      const content = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(content) as PackageJson;
      return { dir: current, pkg };
    } catch {
      // No package.json here, go up
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root
      break;
    }
    current = parent;
  }

  return null;
}

// =============================================================================
// Registry Operations
// =============================================================================

const REGISTRY_FILENAME = ".client-registry.json";

/**
 * Read the registry file, or return empty registry if it doesn't exist.
 */
async function readRegistry(rootDir: string): Promise<Registry> {
  const registryPath = path.join(rootDir, REGISTRY_FILENAME);

  try {
    const content = await fs.readFile(registryPath, "utf-8");
    return JSON.parse(content) as Registry;
  } catch {
    return {
      schemaVersion: 1,
      packages: {},
    };
  }
}

/**
 * Write the registry file.
 */
async function writeRegistry(rootDir: string, registry: Registry): Promise<void> {
  const registryPath = path.join(rootDir, REGISTRY_FILENAME);
  const content = JSON.stringify(registry, null, 2) + "\n";
  await fs.writeFile(registryPath, content, "utf-8");
}

// =============================================================================
// Main
// =============================================================================

/**
 * Announce this package's procedures to the project registry.
 *
 * Called from a package's postinstall script to register its procedures.
 * Also propagates the postinstall script UP the dependency chain for transitive discovery.
 *
 * The propagation works as follows:
 * - When client is installed in package D, client's postinstall adds postinstall to D
 * - When D is installed in C, D's postinstall adds postinstall to C
 * - When C is installed in B, C's postinstall adds postinstall to B
 * - etc.
 *
 * This ensures that regardless of how deep procedures are defined,
 * they can propagate up to the project root for efficient discovery.
 */
export async function announce(options: AnnounceOptions): Promise<void> {
  const { verbose } = options;

  // Find the package we're in (the one whose postinstall is running)
  const containing = await findContainingPackage(process.cwd());
  if (!containing) {
    if (verbose) {
      console.log("[client] No package.json found, skipping announcement");
    }
    return;
  }

  const { dir: packageDir, pkg } = containing;

  // Always propagate postinstall to parent package (for transitive chain)
  await propagatePostinstallToParent(packageDir, pkg, verbose);

  // If this package has procedures, register them
  if (pkg.client?.procedures) {
    await registerProcedures(packageDir, pkg, verbose);
  } else if (verbose) {
    console.log(`[client] ${pkg.name} does not declare procedures`);
  }
}

/**
 * Register this package's procedures at the project root.
 */
async function registerProcedures(packageDir: string, pkg: PackageJson, verbose: boolean): Promise<void> {
  // Find the project root
  const projectRoot = await findProjectRoot(packageDir);
  if (!projectRoot) {
    if (verbose) {
      console.log("[client] Could not find project root, skipping registration");
    }
    return;
  }

  // Don't register if we ARE the project root (we're the app, not a dependency)
  if (path.resolve(packageDir) === path.resolve(projectRoot)) {
    if (verbose) {
      console.log(`[client] ${pkg.name} is the project root, skipping self-registration`);
    }
    return;
  }

  // Read current registry
  const registry = await readRegistry(projectRoot);

  // Add/update our entry
  const entry: RegistryEntry = {
    proceduresPath: pkg.client!.procedures!,
    registeredAt: new Date().toISOString(),
  };
  if (pkg.version) {
    entry.version = pkg.version;
  }
  registry.packages[pkg.name] = entry;

  // Write updated registry
  await writeRegistry(projectRoot, registry);

  if (verbose) {
    console.log(`[client] Registered ${pkg.name} -> ${pkg.client!.procedures}`);
  }
}

/**
 * Propagate postinstall to the parent package.
 * This ensures the chain continues when this package is installed elsewhere.
 */
async function propagatePostinstallToParent(packageDir: string, pkg: PackageJson, verbose: boolean): Promise<void> {
  // Find parent package (the one that depends on this package)
  const parent = await findParentPackage(packageDir);
  if (!parent) {
    if (verbose) {
      console.log(`[client] No parent package found for ${pkg.name}`);
    }
    return;
  }

  const { dir: parentDir, pkg: parentPkg } = parent;

  // Don't modify packages inside node_modules of other packages
  // We only want to modify the immediate dependent
  if (isNestedNodeModules(parentDir)) {
    if (verbose) {
      console.log(`[client] Parent ${parentPkg.name} is nested in node_modules, skipping`);
    }
    return;
  }

  await ensurePostinstall(parentDir, parentPkg, verbose);
}

/**
 * Find the parent package (the one that depends on the current package).
 * Walks up from node_modules to find the containing project.
 */
async function findParentPackage(packageDir: string): Promise<{ dir: string; pkg: PackageJson } | null> {
  let current = path.dirname(packageDir);

  while (true) {
    // Skip node_modules directories
    const basename = path.basename(current);
    if (basename === "node_modules") {
      current = path.dirname(current);
      continue;
    }

    const pkgPath = path.join(current, "package.json");

    try {
      const content = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(content) as PackageJson;
      return { dir: current, pkg };
    } catch {
      // No package.json here
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

/**
 * Check if a path is inside nested node_modules (e.g., node_modules/a/node_modules/b).
 */
function isNestedNodeModules(dir: string): boolean {
  const normalized = dir.replace(/\\/g, "/");
  const parts = normalized.split("/node_modules/");
  return parts.length > 2;
}

/**
 * Ensure a package has the postinstall script for propagation.
 */
async function ensurePostinstall(packageDir: string, pkg: PackageJson, verbose: boolean): Promise<void> {
  const pkgPath = path.join(packageDir, "package.json");

  let fullPkg: Record<string, unknown>;
  try {
    fullPkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as Record<string, unknown>;
  } catch {
    if (verbose) {
      console.log(`[client] Could not read ${pkgPath}`);
    }
    return;
  }

  const scripts = (fullPkg["scripts"] ?? {}) as Record<string, string>;
  const postinstall = scripts["postinstall"] ?? "";

  // Check if postinstall already includes client announce
  if (postinstall.includes("client announce")) {
    if (verbose) {
      console.log(`[client] ${pkg.name} already has client announce in postinstall`);
    }
    return;
  }

  // Add client announce to postinstall
  const newPostinstall = postinstall
    ? `${postinstall} && client announce 2>/dev/null || true`
    : "client announce 2>/dev/null || true";

  scripts["postinstall"] = newPostinstall;
  fullPkg["scripts"] = scripts;

  try {
    await fs.writeFile(pkgPath, JSON.stringify(fullPkg, null, 2) + "\n", "utf-8");
    if (verbose) {
      console.log(`[client] Added postinstall to ${pkg.name}`);
    }
  } catch (error) {
    if (verbose) {
      console.log(`[client] Could not write to ${pkgPath}: ${error}`);
    }
  }
}

/**
 * Remove this package from the registry (for uninstall).
 */
export async function unannounce(options: AnnounceOptions): Promise<void> {
  const { verbose } = options;

  const containing = await findContainingPackage(process.cwd());
  if (!containing) return;

  const { dir: packageDir, pkg } = containing;
  const projectRoot = await findProjectRoot(packageDir);
  if (!projectRoot) return;

  const registry = await readRegistry(projectRoot);

  if (registry.packages[pkg.name]) {
    delete registry.packages[pkg.name];
    await writeRegistry(projectRoot, registry);

    if (verbose) {
      console.log(`[client] Unregistered ${pkg.name}`);
    }
  }
}

/**
 * Get the registry for use by discover command.
 */
export async function getRegistry(rootDir: string): Promise<Registry> {
  return readRegistry(rootDir);
}

export { REGISTRY_FILENAME };
export type { Registry, RegistryEntry };
