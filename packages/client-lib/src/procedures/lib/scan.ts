/**
 * lib.scan procedure
 *
 * Scans ecosystem packages using ecosystem.manifest.json as the source of truth.
 * Only processes packages listed in the manifest - does NOT scan arbitrary directories.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibScanInput, LibScanOutput, PackageInfo } from "../../types.js";
import { isMark1Russell7Ref } from "../../git/index.js";

interface FsExistsOutput { exists: boolean; path: string; }
interface FsReadJsonOutput { path: string; data: unknown; }
interface GitStatusOutput { branch: string; }
interface GitRemoteOutput { name: string; url: string; }

interface EcosystemManifest {
  version: string;
  root: string;
  packages: Record<string, { repo: string; path: string }>;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const DEFAULT_ROOT = join(homedir(), "git");

/**
 * Resolve ~ to home directory
 */
function resolveRoot(root: string): string {
  if (root.startsWith("~/")) {
    return join(homedir(), root.slice(2));
  }
  return root;
}

/**
 * Read and parse package.json
 */
async function readPackageJson(dirPath: string, ctx: ProcedureContext): Promise<PackageJson | null> {
  try {
    const pkgPath = join(dirPath, "package.json");
    const result = await ctx.client.call<{ path: string }, FsReadJsonOutput>(
      ["fs", "read.json"],
      { path: pkgPath }
    );
    return result.data as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Extract mark1russell7 dependencies from a package.json
 */
function extractMark1Russell7Deps(pkg: PackageJson): string[] {
  const deps: string[] = [];
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  for (const [name, version] of Object.entries(allDeps)) {
    if (isMark1Russell7Ref(version)) {
      deps.push(name);
    }
  }

  return deps;
}

/**
 * Load the ecosystem manifest
 */
async function loadManifest(rootPath: string, ctx: ProcedureContext): Promise<EcosystemManifest | null> {
  try {
    const manifestPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");
    const result = await ctx.client.call<{ path: string }, FsReadJsonOutput>(
      ["fs", "read.json"],
      { path: manifestPath }
    );
    return result.data as EcosystemManifest;
  } catch {
    return null;
  }
}

/**
 * Scan a single package from the manifest
 */
async function scanPackage(
  packageName: string,
  manifestEntry: { repo: string; path: string },
  rootPath: string,
  ctx: ProcedureContext
): Promise<{ info: PackageInfo | null; warning: { path: string; issue: string } | null }> {
  const pkgPath = join(rootPath, manifestEntry.path);

  // Check if the package exists on disk
  try {
    const existsResult = await ctx.client.call<{ path: string }, FsExistsOutput>(
      ["fs", "exists"],
      { path: pkgPath }
    );
    if (!existsResult.exists) {
      return {
        info: null,
        warning: { path: pkgPath, issue: `Package directory does not exist` },
      };
    }
  } catch (error) {
    return {
      info: null,
      warning: { path: pkgPath, issue: `Failed to check existence: ${error instanceof Error ? error.message : String(error)}` },
    };
  }

  // Read package.json
  const pkg = await readPackageJson(pkgPath, ctx);
  if (!pkg) {
    return {
      info: null,
      warning: { path: pkgPath, issue: `Failed to read package.json` },
    };
  }

  const actualName = pkg.name ?? packageName;
  const mark1russell7Deps = extractMark1Russell7Deps(pkg);

  // Get git status
  try {
    const statusResult = await ctx.client.call<{ cwd?: string }, GitStatusOutput>(
      ["git", "status"],
      { cwd: pkgPath }
    );
    const currentBranch = statusResult.branch;

    let gitRemote: string | undefined;
    try {
      const remoteResult = await ctx.client.call<{ cwd?: string; name?: string }, GitRemoteOutput>(
        ["git", "remote"],
        { cwd: pkgPath, name: "origin" }
      );
      gitRemote = remoteResult.url;
    } catch {
      // No remote configured
    }

    const pkgInfo: PackageInfo = {
      name: actualName,
      repoPath: pkgPath,
      currentBranch,
      mark1russell7Deps,
    };
    if (gitRemote !== undefined) {
      pkgInfo.gitRemote = gitRemote;
    }

    return { info: pkgInfo, warning: null };
  } catch (error) {
    // Git not initialized - this is a warning but still return the package info
    return {
      info: {
        name: actualName,
        repoPath: pkgPath,
        mark1russell7Deps,
      },
      warning: { path: pkgPath, issue: `Git not initialized: ${error instanceof Error ? error.message : String(error)}` },
    };
  }
}

/**
 * Scan for packages using the ecosystem manifest as the source of truth
 */
export async function libScan(input: LibScanInput, ctx: ProcedureContext): Promise<LibScanOutput> {
  const rootPath = input.rootPath ?? DEFAULT_ROOT;
  const packages: Record<string, PackageInfo> = {};
  const warnings: Array<{ path: string; issue: string }> = [];

  // Load the manifest
  const manifest = await loadManifest(rootPath, ctx);
  if (!manifest) {
    warnings.push({
      path: join(rootPath, "ecosystem", "ecosystem.manifest.json"),
      issue: "Failed to load ecosystem manifest - no packages to scan",
    });
    return { packages, warnings };
  }

  // Resolve the manifest root (might be ~/git)
  const manifestRoot = resolveRoot(manifest.root);

  // Scan each package listed in the manifest
  for (const [packageName, entry] of Object.entries(manifest.packages)) {
    const result = await scanPackage(packageName, entry, manifestRoot, ctx);

    if (result.info) {
      packages[result.info.name] = result.info;
    }
    if (result.warning) {
      warnings.push(result.warning);
    }
  }

  return { packages, warnings };
}