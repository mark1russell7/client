/**
 * lib.scan procedure
 *
 * Scans ecosystem packages using ecosystem.manifest.json as the source of truth.
 * Only processes packages listed in the manifest - does NOT scan arbitrary directories.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { isMark1Russell7Ref } from "../../git/index.js";
const DEFAULT_ROOT = join(homedir(), "git");
/**
 * Resolve ~ to home directory
 */
function resolveRoot(root) {
    if (root.startsWith("~/")) {
        return join(homedir(), root.slice(2));
    }
    return root;
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
 * Load the ecosystem manifest
 */
async function loadManifest(rootPath, ctx) {
    try {
        const manifestPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");
        const result = await ctx.client.call(["fs", "read.json"], { path: manifestPath });
        return result.data;
    }
    catch {
        return null;
    }
}
/**
 * Scan a single package from the manifest
 */
async function scanPackage(packageName, manifestEntry, rootPath, ctx) {
    const pkgPath = join(rootPath, manifestEntry.path);
    // Check if the package exists on disk
    try {
        const existsResult = await ctx.client.call(["fs", "exists"], { path: pkgPath });
        if (!existsResult.exists) {
            return {
                info: null,
                warning: { path: pkgPath, issue: `Package directory does not exist` },
            };
        }
    }
    catch (error) {
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
        const statusResult = await ctx.client.call(["git", "status"], { cwd: pkgPath });
        const currentBranch = statusResult.branch;
        let gitRemote;
        try {
            const remoteResult = await ctx.client.call(["git", "remote"], { cwd: pkgPath, name: "origin" });
            gitRemote = remoteResult.url;
        }
        catch {
            // No remote configured
        }
        const pkgInfo = {
            name: actualName,
            repoPath: pkgPath,
            currentBranch,
            mark1russell7Deps,
        };
        if (gitRemote !== undefined) {
            pkgInfo.gitRemote = gitRemote;
        }
        return { info: pkgInfo, warning: null };
    }
    catch (error) {
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
export async function libScan(input, ctx) {
    const rootPath = input.rootPath ?? DEFAULT_ROOT;
    const packages = {};
    const warnings = [];
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
//# sourceMappingURL=scan.js.map