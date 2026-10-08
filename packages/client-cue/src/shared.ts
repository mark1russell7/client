/**
 * Shared utilities for cue procedures
 *
 * Uses ctx.client.call() for file system operations (dogfooding).
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProcedureContext } from "@mark1russell7/client";
import type { FeaturesManifest, DependenciesJson } from "./types.js";

// Constants
const __dirname: string = dirname(fileURLToPath(import.meta.url));
export const packageRoot: string = resolve(__dirname, "..", "node_modules", "@mark1russell7", "cue");

// Tsconfig priority: later features override earlier (most specific wins)
export const TSCONFIG_PRIORITY: readonly string[] = ["ts", "node", "node-cjs", "vite", "react"] as const;

// =============================================================================
// FS Procedure Output Types
// =============================================================================

interface FsExistsOutput {
  exists: boolean;
  path: string;
}

interface FsReadOutput {
  path: string;
  content: string;
}

interface FsWriteOutput {
  path: string;
  written: number;
}

interface FsMkdirOutput {
  path: string;
  created: boolean;
}

// =============================================================================
// File System Helpers (using ctx.client.call)
// =============================================================================

export async function fileExists(path: string, ctx: ProcedureContext): Promise<boolean> {
  try {
    const result = await ctx.client.call<{ path: string }, FsExistsOutput>(
      ["fs", "exists"],
      { path }
    );
    return result.exists;
  } catch {
    return false;
  }
}

export async function readFile(path: string, ctx: ProcedureContext): Promise<string | null> {
  try {
    const result = await ctx.client.call<{ path: string; encoding?: string }, FsReadOutput>(
      ["fs", "read"],
      { path, encoding: "utf-8" }
    );
    return result.content;
  } catch {
    return null;
  }
}

export async function writeFile(path: string, content: string, ctx: ProcedureContext): Promise<boolean> {
  try {
    await ctx.client.call<{ path: string; content: string }, FsWriteOutput>(
      ["fs", "write"],
      { path, content }
    );
    return true;
  } catch {
    return false;
  }
}

export async function mkdir(path: string, ctx: ProcedureContext): Promise<boolean> {
  try {
    await ctx.client.call<{ path: string; recursive?: boolean }, FsMkdirOutput>(
      ["fs", "mkdir"],
      { path, recursive: true }
    );
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// JSON Helpers
// =============================================================================

export async function readJson<T>(path: string, ctx: ProcedureContext): Promise<T | null> {
  const content = await readFile(path, ctx);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function writeJson<T>(path: string, data: T, ctx: ProcedureContext): Promise<boolean> {
  const content = JSON.stringify(data, null, 2) + "\n";
  return writeFile(path, content, ctx);
}

// =============================================================================
// Core Functions
// =============================================================================

export async function loadFeatures(ctx: ProcedureContext): Promise<FeaturesManifest | null> {
  const featuresPath = resolve(packageRoot, "features.json");
  return readJson<FeaturesManifest>(featuresPath, ctx);
}

export async function loadDependencies(
  projectPath: string,
  ctx: ProcedureContext
): Promise<string[] | null> {
  const depsPath = resolve(projectPath, "dependencies.json");
  const content = await readJson<DependenciesJson | string[]>(depsPath, ctx);

  if (!content) return null;

  if (Array.isArray(content)) {
    return content;
  }

  if (content.dependencies && Array.isArray(content.dependencies)) {
    return content.dependencies;
  }

  return null;
}

export async function saveDependencies(
  deps: string[],
  projectPath: string,
  ctx: ProcedureContext
): Promise<boolean> {
  const depsJson: DependenciesJson = {
    $schema: "./node_modules/@mark1russell7/cue/dependencies/schema.json",
    dependencies: deps,
  };
  return writeJson(resolve(projectPath, "dependencies.json"), depsJson, ctx);
}

// Flood-fill resolve all transitive dependencies
export function resolveFeatures(requested: string[], manifest: FeaturesManifest): string[] {
  const resolved = new Set<string>();
  const queue = [...requested];

  while (queue.length > 0) {
    const feature = queue.shift()!;
    if (resolved.has(feature)) continue;

    const featureDef = manifest.features[feature];
    if (!featureDef) continue;

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
export function featureToFieldName(feature: string): string {
  if (feature === "vite-react") return "viteReact";
  return feature;
}

// =============================================================================
// CUE Evaluation
// =============================================================================

export function checkCue(): boolean {
  try {
    const result = spawnSync("cue", ["version"], { stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function determineTsconfig(resolvedFeatures: string[]): string {
  let selected = "ts";
  for (const feature of TSCONFIG_PRIORITY) {
    if (resolvedFeatures.includes(feature)) {
      selected = feature;
    }
  }
  return selected;
}
