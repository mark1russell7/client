/**
 * lib.scan procedure
 *
 * Scans ~/git for all packages and builds a mapping of package name to repo path.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibScanInput, LibScanOutput, PackageInfo } from "../../types.js";
import { isMark1Russell7Ref } from "../../git/index.js";

interface FsExistsOutput { exists: boolean; path: string; }
interface FsReaddirOutput { path: string; entries: Array<{ name: string; path: string; type: "file" | "directory" | "symlink" | "other" }>; }
interface FsReadJsonOutput { path: string; data: unknown; }
interface GitStatusOutput { branch: string; }
interface GitRemoteOutput { name: string; url: string; }

const DEFAULT_ROOT = join(homedir(), "git");

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Check if a directory contains a package.json
 */
async function isPackageDir(dirPath: string, ctx: ProcedureContext): Promise<boolean> {
  try {
    const pkgPath = join(dirPath, "package.json");
    const result = await ctx.client.call<{ path: string }, FsExistsOutput>(
      ["fs", "exists"],
      { path: pkgPath }
    );
    return result.exists;
  } catch {
    return false;
  }
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
 * Scan a directory recursively for packages
 */
async function scanDirectory(
  dirPath: string,
  packages: Record<string, PackageInfo>,
  warnings: Array<{ path: string; issue: string }>,
  ctx: ProcedureContext,
  depth: number = 0,
  maxDepth: number = 2
): Promise<void> {
  if (depth > maxDepth) return;

  // Check if this directory is a package
  if (await isPackageDir(dirPath, ctx)) {
    const pkg = await readPackageJson(dirPath, ctx);

    if (pkg?.name) {
      try {
        const statusResult = await ctx.client.call<{ cwd?: string }, GitStatusOutput>(
          ["git", "status"],
          { cwd: dirPath }
        );
        const currentBranch = statusResult.branch;

        let gitRemote: string | undefined;
        try {
          const remoteResult = await ctx.client.call<{ cwd?: string; name?: string }, GitRemoteOutput>(
            ["git", "remote"],
            { cwd: dirPath, name: "origin" }
          );
          gitRemote = remoteResult.url;
        } catch {
          // No remote configured
        }

        const mark1russell7Deps = extractMark1Russell7Deps(pkg);

        const pkgInfo: PackageInfo = {
          name: pkg.name,
          repoPath: dirPath,
          currentBranch,
          mark1russell7Deps,
        };
        if (gitRemote !== undefined) {
          pkgInfo.gitRemote = gitRemote;
        }
        packages[pkg.name] = pkgInfo;
      } catch (error) {
        warnings.push({
          path: dirPath,
          issue: `Failed to get git info: ${error instanceof Error ? error.message : String(error)}`,
        });

        // Still add the package even without git info
        const mark1russell7Deps = extractMark1Russell7Deps(pkg);
        packages[pkg.name] = {
          name: pkg.name,
          repoPath: dirPath,
          mark1russell7Deps,
        };
      }
    } else {
      warnings.push({
        path: dirPath,
        issue: "Package has no name in package.json",
      });
    }
  }

  // Scan subdirectories (but not node_modules, dist, etc.)
  try {
    const result = await ctx.client.call<{ path: string }, FsReaddirOutput>(
      ["fs", "readdir"],
      { path: dirPath }
    );

    for (const entry of result.entries) {
      if (entry.type !== "directory") continue;

      // Skip common non-package directories
      const skipDirs = ["node_modules", "dist", ".git", ".vscode", "coverage"];
      if (skipDirs.includes(entry.name)) continue;

      const subPath = join(dirPath, entry.name);
      await scanDirectory(subPath, packages, warnings, ctx, depth + 1, maxDepth);
    }
  } catch (error) {
    warnings.push({
      path: dirPath,
      issue: `Failed to scan directory: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Scan for packages in the git directory
 */
export async function libScan(input: LibScanInput, ctx: ProcedureContext): Promise<LibScanOutput> {
  const rootPath = input.rootPath ?? DEFAULT_ROOT;
  const packages: Record<string, PackageInfo> = {};
  const warnings: Array<{ path: string; issue: string }> = [];

  try {
    await scanDirectory(rootPath, packages, warnings, ctx);
  } catch (error) {
    warnings.push({
      path: rootPath,
      issue: `Failed to scan root: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return { packages, warnings };
}
