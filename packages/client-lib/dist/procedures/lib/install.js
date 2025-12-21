/**
 * lib.install procedure
 *
 * Installs the entire ecosystem:
 * 1. Reads ecosystem manifest from @mark1russell7/ecosystem
 * 2. Clones missing packages
 * 3. Installs and builds all packages in DAG order
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { clone } from "../../git/index.js";
import { buildDAGNodes, buildLeveledDAG, executeDAG, createProcessor } from "../../dag/index.js";
import { libScan } from "./scan.js";
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
 * Parse repo string to git URL
 * Format: github:owner/repo#branch
 */
function repoToGitUrl(repo) {
    const match = repo.match(/^github:([^#]+)#(.+)$/);
    if (!match || match[1] === undefined || match[2] === undefined) {
        throw new Error(`Invalid repo format: ${repo}`);
    }
    return {
        url: `git@github.com:${match[1]}.git`,
        branch: match[2],
    };
}
/**
 * Check if a directory exists
 */
async function dirExists(pathStr, ctx) {
    try {
        const result = await ctx.client.call(["fs", "exists"], { path: pathStr });
        return result.exists;
    }
    catch {
        return false;
    }
}
/**
 * Load ecosystem manifest from local path
 */
async function loadManifest(rootPath, ctx) {
    const localPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");
    try {
        const result = await ctx.client.call(["fs", "read.json"], { path: localPath });
        return result.data;
    }
    catch {
        throw new Error(`Could not load ecosystem manifest from ${localPath}. ` +
            `Make sure the ecosystem package is cloned to ${rootPath}/ecosystem`);
    }
}
/**
 * Install the entire ecosystem
 */
export async function libInstall(input, ctx) {
    const startTime = Date.now();
    const results = [];
    const cloned = [];
    const skipped = [];
    const errors = [];
    // Load manifest
    const defaultRoot = join(homedir(), "git");
    const rootPath = input.rootPath ?? defaultRoot;
    let manifest;
    try {
        manifest = await loadManifest(rootPath, ctx);
    }
    catch (error) {
        return {
            success: false,
            cloned: [],
            skipped: [],
            results: [],
            errors: [error instanceof Error ? error.message : String(error)],
            totalDuration: Date.now() - startTime,
        };
    }
    const resolvedRoot = resolveRoot(manifest.root);
    // Phase 1: Clone missing packages
    for (const [pkgName, entry] of Object.entries(manifest.packages)) {
        const pkgPath = join(resolvedRoot, entry.path);
        if (await dirExists(pkgPath, ctx)) {
            skipped.push(pkgName);
            continue;
        }
        if (input.dryRun) {
            cloned.push(pkgName);
            continue;
        }
        try {
            const { url, branch } = repoToGitUrl(entry.repo);
            await clone(url, pkgPath, ctx, branch);
            cloned.push(pkgName);
        }
        catch (error) {
            errors.push(`Failed to clone ${pkgName}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    if (input.dryRun) {
        return {
            success: true,
            cloned,
            skipped,
            results: [],
            errors,
            totalDuration: Date.now() - startTime,
        };
    }
    // Phase 2: Scan and build DAG
    const scanResult = await libScan({ rootPath: resolvedRoot }, ctx);
    const allNodes = buildDAGNodes(scanResult.packages);
    const dag = buildLeveledDAG(allNodes);
    // Phase 3: Install and build in DAG order
    const processor = createProcessor(async (node) => {
        const pkgStartTime = Date.now();
        // pnpm install
        const installResult = await ctx.client.call(["pnpm", "install"], { cwd: node.repoPath });
        if (!installResult.success) {
            throw new Error(`pnpm install failed: ${installResult.stderr}`);
        }
        // pnpm run build
        const buildResult = await ctx.client.call(["pnpm", "run"], { script: "build", cwd: node.repoPath });
        if (!buildResult.success) {
            throw new Error(`pnpm run build failed: ${buildResult.stderr}`);
        }
        results.push({
            name: node.name,
            path: node.repoPath,
            success: true,
            duration: Date.now() - pkgStartTime,
            phase: "complete",
        });
    });
    const dagResult = await executeDAG(dag, processor, {
        concurrency: input.concurrency ?? 4,
        failFast: !input.continueOnError,
    });
    // Add failed results
    for (const [name, nodeResult] of dagResult.results) {
        if (!nodeResult.success) {
            const node = allNodes.get(name);
            const failedResult = {
                name,
                path: node?.repoPath ?? "unknown",
                success: false,
                duration: nodeResult.duration,
            };
            if (nodeResult.error?.message !== undefined) {
                failedResult.error = nodeResult.error.message;
            }
            results.push(failedResult);
        }
    }
    return {
        success: dagResult.success && errors.length === 0,
        cloned,
        skipped,
        results,
        errors,
        totalDuration: Date.now() - startTime,
    };
}
//# sourceMappingURL=install.js.map