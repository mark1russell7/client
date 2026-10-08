/**
 * Shared utilities for cue procedures
 *
 * Uses ctx.client.call() for file system operations (dogfooding).
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Constants
const __dirname = dirname(fileURLToPath(import.meta.url));
export const packageRoot = resolve(__dirname, "..", "node_modules", "@mark1russell7", "cue");
// Tsconfig priority: later features override earlier (most specific wins)
export const TSCONFIG_PRIORITY = ["ts", "node", "node-cjs", "vite", "react"];
// =============================================================================
// File System Helpers (using ctx.client.call)
// =============================================================================
export async function fileExists(path, ctx) {
    try {
        const result = await ctx.client.call(["fs", "exists"], { path });
        return result.exists;
    }
    catch {
        return false;
    }
}
export async function readFile(path, ctx) {
    try {
        const result = await ctx.client.call(["fs", "read"], { path, encoding: "utf-8" });
        return result.content;
    }
    catch {
        return null;
    }
}
export async function writeFile(path, content, ctx) {
    try {
        await ctx.client.call(["fs", "write"], { path, content });
        return true;
    }
    catch {
        return false;
    }
}
export async function mkdir(path, ctx) {
    try {
        await ctx.client.call(["fs", "mkdir"], { path, recursive: true });
        return true;
    }
    catch {
        return false;
    }
}
// =============================================================================
// JSON Helpers
// =============================================================================
export async function readJson(path, ctx) {
    const content = await readFile(path, ctx);
    if (!content)
        return null;
    try {
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
export async function writeJson(path, data, ctx) {
    const content = JSON.stringify(data, null, 2) + "\n";
    return writeFile(path, content, ctx);
}
// =============================================================================
// Core Functions
// =============================================================================
export async function loadFeatures(ctx) {
    const featuresPath = resolve(packageRoot, "features.json");
    return readJson(featuresPath, ctx);
}
export async function loadDependencies(projectPath, ctx) {
    const depsPath = resolve(projectPath, "dependencies.json");
    const content = await readJson(depsPath, ctx);
    if (!content)
        return null;
    if (Array.isArray(content)) {
        return content;
    }
    if (content.dependencies && Array.isArray(content.dependencies)) {
        return content.dependencies;
    }
    return null;
}
export async function saveDependencies(deps, projectPath, ctx) {
    const depsJson = {
        $schema: "./node_modules/@mark1russell7/cue/dependencies/schema.json",
        dependencies: deps,
    };
    return writeJson(resolve(projectPath, "dependencies.json"), depsJson, ctx);
}
// Flood-fill resolve all transitive dependencies
export function resolveFeatures(requested, manifest) {
    const resolved = new Set();
    const queue = [...requested];
    while (queue.length > 0) {
        const feature = queue.shift();
        if (resolved.has(feature))
            continue;
        const featureDef = manifest.features[feature];
        if (!featureDef)
            continue;
        resolved.add(feature);
        for (const dep of featureDef.dependencies) {
            if (!resolved.has(dep)) {
                queue.push(dep);
            }
        }
    }
    return Array.from(resolved);
}
// Map feature name to CUE file field name (handle vite-react -> viteReact)
export function featureToFieldName(feature) {
    if (feature === "vite-react")
        return "viteReact";
    return feature;
}
// =============================================================================
// CUE Evaluation
// =============================================================================
export function checkCue() {
    try {
        const result = spawnSync("cue", ["version"], { stdio: "ignore" });
        return result.status === 0;
    }
    catch {
        return false;
    }
}
export function determineTsconfig(resolvedFeatures) {
    let selected = "ts";
    for (const feature of TSCONFIG_PRIORITY) {
        if (resolvedFeatures.includes(feature)) {
            selected = feature;
        }
    }
    return selected;
}
//# sourceMappingURL=shared.js.map