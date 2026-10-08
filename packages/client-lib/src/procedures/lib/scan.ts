/**
 * lib.scan procedure
 *
 * Scans the packages of the workspace (`<root>/packages/*`). The root is the pnpm
 * workspace that contains client-lib, unless the input gives `rootPath`.
 * All packages share one git repository, so the branch and the remote are read once.
 */

import { join } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibScanInput, LibScanOutput, PackageInfo } from "../../types.js";
import { extractEcosystemDeps, packagesDir, resolveWorkspaceRoot } from "../../workspace.js";

interface FsReadJsonOutput {
  path: string;
  data: unknown;
}

interface FsReaddirOutput {
  path: string;
  entries: Array<{ name: string; path: string; type: string }>;
}

interface GitStatusOutput {
  branch: string;
}

interface GitRemoteOutput {
  name: string;
  url: string;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/**
 * Read and parse package.json from a directory using fs.read.json
 */
async function readPackageJson(dirPath: string, ctx: ProcedureContext): Promise<PackageJson | null> {
  try {
    const result = await ctx.client.call<{ path: string }, FsReadJsonOutput>(
      ["fs", "read.json"],
      { path: join(dirPath, "package.json") }
    );
    return result.data as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Read the branch and the origin remote of the repository that holds the workspace
 */
async function readRepositoryInfo(
  rootPath: string,
  ctx: ProcedureContext
): Promise<{ branch?: string; remote?: string; warning?: string }> {
  try {
    const status = await ctx.client.call<{ cwd?: string }, GitStatusOutput>(["git", "status"], { cwd: rootPath });
    let remote: string | undefined;
    try {
      const result = await ctx.client.call<{ cwd?: string; name?: string }, GitRemoteOutput>(
        ["git", "remote"],
        { cwd: rootPath, name: "origin" }
      );
      remote = result.url;
    } catch {
      // No remote configured - that's fine
    }
    return remote === undefined ? { branch: status.branch } : { branch: status.branch, remote };
  } catch (error) {
    return { warning: `Git not initialized: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Scan the workspace packages
 */
export async function libScan(input: LibScanInput, ctx: ProcedureContext): Promise<LibScanOutput> {
  const packages: Record<string, PackageInfo> = {};
  const warnings: Array<{ path: string; issue: string }> = [];

  let rootPath: string;
  try {
    rootPath = resolveWorkspaceRoot(input.rootPath);
  } catch (error) {
    warnings.push({
      path: input.rootPath ?? process.cwd(),
      issue: error instanceof Error ? error.message : String(error),
    });
    return { packages, warnings };
  }

  const dir = packagesDir(rootPath);
  let entries: FsReaddirOutput["entries"];
  try {
    const result = await ctx.client.call<{ path: string }, FsReaddirOutput>(["fs", "readdir"], { path: dir });
    entries = result.entries.filter((entry) => entry.type === "directory");
  } catch (error) {
    warnings.push({
      path: dir,
      issue: `Failed to list workspace packages: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { packages, warnings };
  }

  const repository = await readRepositoryInfo(rootPath, ctx);
  if (repository.warning) {
    warnings.push({ path: rootPath, issue: repository.warning });
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const pkgPath = join(dir, entry.name);
    const pkg = await readPackageJson(pkgPath, ctx);
    if (!pkg) {
      warnings.push({ path: pkgPath, issue: "Failed to read package.json" });
      continue;
    }
    if (!pkg.name) {
      warnings.push({ path: pkgPath, issue: "package.json has no name" });
      continue;
    }

    const info: PackageInfo = {
      name: pkg.name,
      repoPath: pkgPath,
      mark1russell7Deps: extractEcosystemDeps(pkg),
    };
    if (repository.branch !== undefined) {
      info.currentBranch = repository.branch;
    }
    if (repository.remote !== undefined) {
      info.gitRemote = repository.remote;
    }
    packages[pkg.name] = info;
  }

  return { packages, warnings };
}
