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
 * 4. Procedures auto-register via PROCEDURE_REGISTRY
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// =============================================================================
// Types
// =============================================================================

interface PackageJson {
  name: string;
  client?: {
    procedures?: string;
  };
}

interface DiscoveredPackage {
  name: string;
  path: string;
  proceduresPath: string;
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
function findWorkspaceRoot(): string | null {
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
export function discoverFromEcosystem(): DiscoveredPackage[] {
  const discovered: DiscoveredPackage[] = [];

  const root = findWorkspaceRoot();
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
      });
    }
  }

  return discovered;
}

/**
 * Dynamically load procedures from discovered packages
 */
export async function loadEcosystemProcedures(verbose = false): Promise<string[]> {
  const discovered = discoverFromEcosystem();
  const loaded: string[] = [];

  for (const pkg of discovered) {
    try {
      // Build the full path to the procedures file
      const proceduresFullPath = path.join(pkg.path, pkg.proceduresPath);

      // Check if file exists
      if (!fs.existsSync(proceduresFullPath)) {
        if (verbose) {
          console.warn(`Procedures file not found: ${proceduresFullPath}`);
        }
        continue;
      }

      // Dynamic import - the module will self-register procedures
      // Use file:// URL for Windows compatibility
      const fileUrl = `file://${proceduresFullPath.replace(/\\/g, "/")}`;
      await import(fileUrl);

      loaded.push(pkg.name);

      if (verbose) {
        console.log(`Loaded procedures from: ${pkg.name}`);
      }
    } catch (error) {
      if (verbose) {
        console.warn(`Failed to load procedures from ${pkg.name}:`, error);
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
