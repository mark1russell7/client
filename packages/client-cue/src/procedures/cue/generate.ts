/**
 * cue.generate procedure
 *
 * Generate config files (package.json, tsconfig.json, .gitignore).
 * Uses ctx.client.call() for file system operations (dogfooding).
 * Uses spawnSync for CUE CLI tool (external binary).
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import type { CueGenerateInput, CueGenerateOutput } from "../../types.js";
import {
  loadFeatures,
  loadDependencies,
  resolveFeatures,
  checkCue,
  determineTsconfig,
  featureToFieldName,
  packageRoot,
  fileExists,
  readJson,
  writeJson,
  writeFile,
  mkdir,
} from "../../shared.js";

interface PackageJson {
  $schema?: string;
  name?: string;
  version?: string;
  [key: string]: unknown;
}

/**
 * Generate package.json via CUE evaluation
 */
async function generatePackageJson(
  resolvedFeatures: string[],
  existingPkg: PackageJson | null,
  ctx: ProcedureContext
): Promise<PackageJson | null> {
  const configDir = resolve(packageRoot, "npm/package");

  // Build list of CUE files to evaluate
  const files: string[] = ["base.cue"];
  for (const feature of resolvedFeatures) {
    const fieldName = featureToFieldName(feature);
    const cuePath = resolve(configDir, `${fieldName}.cue`);
    if (await fileExists(cuePath, ctx)) {
      files.push(`${fieldName}.cue`);
    }
  }

  // Run cue eval
  const result = spawnSync("cue", ["eval", ...files, "-e", "output", "--out", "json"], {
    cwd: configDir,
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return null;
  }

  const generated = JSON.parse(result.stdout) as PackageJson;

  // Merge with existing package.json
  const pkg: PackageJson = { ...existingPkg };

  for (const [key, value] of Object.entries(generated)) {
    if (key === "name" || key === "version" || key === "description") {
      if (!pkg[key]) pkg[key] = value as string;
    } else if (key === "devDependencies" || key === "peerDependencies" || key === "scripts") {
      pkg[key] = { ...(value as Record<string, unknown>), ...(pkg[key] as Record<string, unknown> ?? {}) };
    } else if (key === "files" && Array.isArray(value) && Array.isArray(pkg[key])) {
      const merged = [...(value as string[])];
      for (const item of pkg[key] as string[]) {
        if (!merged.includes(item)) merged.push(item);
      }
      pkg[key] = merged;
    } else {
      pkg[key] = value;
    }
  }

  // Ensure $schema is first
  const ordered: PackageJson = { $schema: "https://json.schemastore.org/package" };
  for (const [key, value] of Object.entries(pkg)) {
    if (key !== "$schema") ordered[key] = value;
  }

  return ordered;
}

/**
 * Generate .gitignore via CUE evaluation
 */
async function generateGitignore(
  resolvedFeatures: string[],
  ctx: ProcedureContext
): Promise<string | null> {
  const configDir = resolve(packageRoot, "git/ignore");

  const files: string[] = ["base.cue"];
  for (const feature of resolvedFeatures) {
    const cuePath = resolve(configDir, `${feature}.cue`);
    if (await fileExists(cuePath, ctx)) {
      files.push(`${feature}.cue`);
    }
  }

  const result = spawnSync("cue", ["eval", ...files, "-e", "patterns", "--out", "json"], {
    cwd: configDir,
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return null;
  }

  const patterns = JSON.parse(result.stdout) as string[];
  return patterns.join("\n") + "\n";
}

/**
 * Setup cue.mod directory
 */
async function setupCueMod(projectPath: string, ctx: ProcedureContext): Promise<void> {
  const cueModPath = resolve(projectPath, "cue.mod");
  if (!(await fileExists(cueModPath, ctx))) {
    await mkdir(cueModPath, ctx);
  }

  await writeFile(
    resolve(cueModPath, "module.cue"),
    `module: "project.local"
language: {
\tversion: "v0.15.1"
}
`,
    ctx
  );
}

/**
 * Generate config files from dependencies.json
 */
export async function cueGenerate(
  input: CueGenerateInput,
  ctx: ProcedureContext
): Promise<CueGenerateOutput> {
  const projectPath = input.cwd ?? process.cwd();
  const generated: string[] = [];

  // Check CUE is installed
  if (!checkCue()) {
    return {
      success: false,
      resolvedFeatures: [],
      generated: [],
      error: "CUE is not installed. Install from: https://cuelang.org/docs/install/",
    };
  }

  // Load features manifest
  const manifest = await loadFeatures(ctx);
  if (!manifest) {
    return {
      success: false,
      resolvedFeatures: [],
      generated: [],
      error: "Could not load features.json from @mark1russell7/cue package",
    };
  }

  // Load dependencies
  const deps = await loadDependencies(projectPath, ctx);
  if (!deps) {
    return {
      success: false,
      resolvedFeatures: [],
      generated: [],
      error: "No dependencies.json found. Run cue.init first.",
    };
  }

  // Resolve transitive dependencies
  const resolvedFeatures = resolveFeatures(deps, manifest);

  // Load existing package.json
  const existingPkg = await readJson<PackageJson>(resolve(projectPath, "package.json"), ctx);

  // Generate package.json
  const packageJson = await generatePackageJson(resolvedFeatures, existingPkg, ctx);
  if (packageJson) {
    await writeJson(resolve(projectPath, "package.json"), packageJson, ctx);
    generated.push("package.json");
  }

  // Generate tsconfig.json if ts feature is present
  if (resolvedFeatures.includes("ts")) {
    const tsconfigName = determineTsconfig(resolvedFeatures);
    const tsconfig = {
      $schema: "https://json.schemastore.org/tsconfig",
      extends: `@mark1russell7/cue/ts/config/${tsconfigName}.json`,
    };
    await writeJson(resolve(projectPath, "tsconfig.json"), tsconfig, ctx);
    generated.push("tsconfig.json");
  }

  // Generate .gitignore
  const gitignoreContent = await generateGitignore(resolvedFeatures, ctx);
  if (gitignoreContent) {
    await writeFile(resolve(projectPath, ".gitignore"), gitignoreContent, ctx);
    generated.push(".gitignore");
  }

  // Setup cue.mod if cue feature is present
  if (resolvedFeatures.includes("cue")) {
    await setupCueMod(projectPath, ctx);
    generated.push("cue.mod/");
  }

  return {
    success: true,
    resolvedFeatures,
    generated,
    message: `Generated ${generated.length} files`,
  };
}
