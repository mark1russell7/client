/**
 * lib.scan procedure
 *
 * Scans ~/git for all packages and builds a mapping of package name to repo path.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { getCurrentBranch, getRemoteUrl, isMark1Russell7Ref } from "../../git/index.js";
const DEFAULT_ROOT = join(homedir(), "git");
/**
 * Check if a directory contains a package.json
 */
async function isPackageDir(dirPath) {
    try {
        const pkgPath = join(dirPath, "package.json");
        const stats = await stat(pkgPath);
        return stats.isFile();
    }
    catch {
        return false;
    }
}
/**
 * Read and parse package.json
 */
async function readPackageJson(dirPath) {
    try {
        const pkgPath = join(dirPath, "package.json");
        const content = await readFile(pkgPath, "utf-8");
        return JSON.parse(content);
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
async function scanDirectory(dirPath, packages, warnings, depth = 0, maxDepth = 2) {
    if (depth > maxDepth)
        return;
    // Check if this directory is a package
    if (await isPackageDir(dirPath)) {
        const pkg = await readPackageJson(dirPath);
        if (pkg?.name) {
            try {
                const currentBranch = await getCurrentBranch(dirPath);
                const gitRemote = await getRemoteUrl(dirPath);
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
        const entries = await readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            // Skip common non-package directories
            const skipDirs = ["node_modules", "dist", ".git", ".vscode", "coverage"];
            if (skipDirs.includes(entry.name))
                continue;
            const subPath = join(dirPath, entry.name);
            await scanDirectory(subPath, packages, warnings, depth + 1, maxDepth);
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
export async function libScan(input) {
    const rootPath = input.rootPath ?? DEFAULT_ROOT;
    const packages = {};
    const warnings = [];
    try {
        await scanDirectory(rootPath, packages, warnings);
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