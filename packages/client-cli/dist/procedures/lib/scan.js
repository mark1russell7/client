/**
 * lib.scan procedure
 *
 * Scans ~/git for all packages and builds a mapping of package name to repo path.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { isMark1Russell7Ref } from "../../git/index.js";
const DEFAULT_ROOT = join(homedir(), "git");
/**
 * Check if a directory contains a package.json
 */
async function isPackageDir(dirPath, ctx) {
    try {
        const pkgPath = join(dirPath, "package.json");
        const result = await ctx.client.call(["fs", "exists"], { path: pkgPath });
        return result.exists;
    }
    catch {
        return false;
    }
}
/**
 * Read and parse package.json
 */
async function readPackageJson(dirPath, ctx) {
    try {
        const pkgPath = join(dirPath, "package.json");
        const result = await ctx.client.call(["fs", "read.json"], { path: pkgPath });
        return result.data;
    }
    catch {
        return null;
    }
}
/**
 * Extract mark1russell7 dependencies from a package.json
 */
function extractMark1Russell7Deps(pkg) {
    const deps = [];
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
async function scanDirectory(dirPath, packages, warnings, ctx, depth = 0, maxDepth = 2) {
    if (depth > maxDepth)
        return;
    // Check if this directory is a package
    if (await isPackageDir(dirPath, ctx)) {
        const pkg = await readPackageJson(dirPath, ctx);
        if (pkg?.name) {
            try {
                const statusResult = await ctx.client.call(["git", "status"], { cwd: dirPath });
                const currentBranch = statusResult.branch;
                let gitRemote;
                try {
                    const remoteResult = await ctx.client.call(["git", "remote"], { cwd: dirPath, name: "origin" });
                    gitRemote = remoteResult.url;
                }
                catch {
                    // No remote configured
                }
                const mark1russell7Deps = extractMark1Russell7Deps(pkg);
                const pkgInfo = {
                    name: pkg.name,
                    repoPath: dirPath,
                    currentBranch,
                    mark1russell7Deps,
                };
                if (gitRemote !== undefined) {
                    pkgInfo.gitRemote = gitRemote;
                }
                packages[pkg.name] = pkgInfo;
            }
            catch (error) {
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
        }
        else {
            warnings.push({
                path: dirPath,
                issue: "Package has no name in package.json",
            });
        }
    }
    // Scan subdirectories (but not node_modules, dist, etc.)
    try {
        const result = await ctx.client.call(["fs", "readdir"], { path: dirPath });
        for (const entry of result.entries) {
            if (entry.type !== "directory")
                continue;
            // Skip common non-package directories
            const skipDirs = ["node_modules", "dist", ".git", ".vscode", "coverage"];
            if (skipDirs.includes(entry.name))
                continue;
            const subPath = join(dirPath, entry.name);
            await scanDirectory(subPath, packages, warnings, ctx, depth + 1, maxDepth);
        }
    }
    catch (error) {
        warnings.push({
            path: dirPath,
            issue: `Failed to scan directory: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}
/**
 * Scan for packages in the git directory
 */
export async function libScan(input, ctx) {
    const rootPath = input.rootPath ?? DEFAULT_ROOT;
    const packages = {};
    const warnings = [];
    try {
        await scanDirectory(rootPath, packages, warnings, ctx);
    }
    catch (error) {
        warnings.push({
            path: rootPath,
            issue: `Failed to scan root: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
    return { packages, warnings };
}
//# sourceMappingURL=scan.js.map