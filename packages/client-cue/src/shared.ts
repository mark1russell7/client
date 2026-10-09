/**
 * Shared utilities for cue procedures
 *
 * Uses ctx.client.call() for file system operations (dogfooding).
 *
 * A file operation that fails is an error of the call. Only a missing file is a normal result.
 * (Before, each helper turned every error into "missing": with no fs.* procedures in the host,
 * cue.validate answered "No dependencies.json found", deep dive WRP-3.)
 */

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import { runCommand, type CommandResult } from "@mark1russell7/client-shell/command";
import type { FeaturesManifest, DependenciesJson } from "./types.js";

// Constants
// The root of the installed @mark1russell7/cue package (its CUE files and features.json).
// Resolve it like an import, so it works wherever the package manager put it
// (BUGS-2026-07 H32: a hard-coded node_modules path only worked for a dev install).
const require = createRequire(import.meta.url);
export const packageRoot: string = dirname(require.resolve("@mark1russell7/cue/features.json"));

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
  const result = await ctx.client.call<{ path: string }, FsExistsOutput>(
    ["fs", "exists"],
    { path }
  );
  return result.exists;
}

/** The content of a file, or null when the file does not exist. Other failures throw. */
export async function readFile(path: string, ctx: ProcedureContext): Promise<string | null> {
  if (!(await fileExists(path, ctx))) return null;
  const result = await ctx.client.call<{ path: string; encoding?: string }, FsReadOutput>(
    ["fs", "read"],
    { path, encoding: "utf-8" }
  );
  return result.content;
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

/** The JSON content of a file, or null when the file does not exist. Text that is not JSON throws. */
export async function readJson<T>(path: string, ctx: ProcedureContext): Promise<T | null> {
  const content = await readFile(path, ctx);
  if (content === null) return null;
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * This function runs the cue program with an argument list and no shell, through `runCommand`
 * of client-shell: async, and the signal of the call kills it (roadmap 2.2).
 */
export function runCue(
  args: string[],
  options: { cwd?: string | undefined; signal?: AbortSignal | undefined } = {}
): Promise<CommandResult> {
  return runCommand("cue", { args, cwd: options.cwd, signal: options.signal, timeout: 120_000 });
}

/** True when the cue program is installed. */
export async function checkCue(signal?: AbortSignal): Promise<boolean> {
  return (await runCue(["version"], { signal })).success;
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
