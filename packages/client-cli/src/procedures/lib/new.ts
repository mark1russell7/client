/**
 * lib.new procedure
 *
 * Creates a new package with standard ecosystem structure.
 * Reads projectTemplate from ecosystem.manifest.json (single source of truth).
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execSync } from "node:child_process";
import type { LibNewInput, LibNewOutput } from "../../types.js";

/**
 * Ecosystem manifest structure
 */
interface EcosystemManifest {
  version: string;
  root: string;
  packages: Record<string, { repo: string; path: string }>;
  projectTemplate: {
    files: string[];
    dirs: string[];
  };
}

/**
 * Resolve ~ to home directory
 */
function resolveRoot(root: string): string {
  if (root.startsWith("~/")) {
    return join(homedir(), root.slice(2));
  }
  return root;
}

/**
 * Check if path exists
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load ecosystem manifest
 */
async function loadManifest(rootPath: string): Promise<EcosystemManifest | null> {
  const manifestPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");
  try {
    const content = await readFile(manifestPath, "utf-8");
    return JSON.parse(content) as EcosystemManifest;
  } catch {
    return null;
  }
}

/**
 * Create a new package with standard ecosystem structure
 */
export async function libNew(input: LibNewInput): Promise<LibNewOutput> {
  const operations: string[] = [];
  const created: string[] = [];
  const errors: string[] = [];

  const rootPath = resolveRoot(input.rootPath ?? "~/git");
  const packagePath = join(rootPath, input.name);
  const packageName = `@mark1russell7/${input.name}`;

  // Load manifest to get projectTemplate (single source of truth)
  const manifest = await loadManifest(rootPath);
  const template = manifest?.projectTemplate ?? {
    files: ["package.json", "tsconfig.json", "dependencies.json", ".gitignore"],
    dirs: ["src", "dist"],
  };

  // Filter out 'dist' from required dirs (created on build)
  const requiredDirs = template.dirs.filter((d) => d !== "dist");

  // Check if package already exists
  if (await pathExists(packagePath)) {
    return {
      success: false,
      packageName,
      packagePath,
      created: [],
      operations: [],
      errors: [`Package directory already exists: ${packagePath}`],
    };
  }

  if (input.dryRun) {
    const dryRunCreated = [
      `${packagePath}/`,
      ...requiredDirs.map((d) => `${packagePath}/${d}/`),
      `${packagePath}/src/index.ts`,
      ...template.files.map((f) => `${packagePath}/${f}`),
    ];
    return {
      success: true,
      packageName,
      packagePath,
      created: dryRunCreated,
      operations: [
        `Using projectTemplate from ${manifest ? "ecosystem.manifest.json" : "defaults"}`,
        "Would create directory structure",
        `Would run cue-config init --preset ${input.preset}`,
        "Would run cue-config generate",
        ...(input.skipGit ? [] : ["Would run git init", "Would create GitHub repo", "Would push to origin"]),
        ...(input.skipManifest ? [] : ["Would add to ecosystem manifest"]),
      ],
      errors: [],
    };
  }

  try {
    // Step 1: Create directory structure from template
    operations.push(`Using projectTemplate from ${manifest ? "ecosystem.manifest.json" : "defaults"}`);
    operations.push("Creating directory structure");
    await mkdir(packagePath, { recursive: true });
    created.push(`${packagePath}/`);

    // Create required directories from template
    for (const dir of requiredDirs) {
      const dirPath = join(packagePath, dir);
      await mkdir(dirPath, { recursive: true });
      created.push(`${dirPath}/`);
    }

    // Create entry point in src if src exists
    if (requiredDirs.includes("src")) {
      const indexPath = join(packagePath, "src", "index.ts");
      await writeFile(indexPath, "// Entry point\nexport {};\n");
      created.push(indexPath);
    }

    // Step 2: Run cue-config init
    operations.push(`Running cue-config init --preset ${input.preset}`);
    execSync(`npx cue-config init --preset ${input.preset} --force`, {
      cwd: packagePath,
      stdio: "pipe",
    });
    created.push(join(packagePath, "dependencies.json"));

    // Step 3: Run cue-config generate
    operations.push("Running cue-config generate");
    execSync("npx cue-config generate", {
      cwd: packagePath,
      stdio: "pipe",
    });
    created.push(join(packagePath, "package.json"));
    created.push(join(packagePath, "tsconfig.json"));
    created.push(join(packagePath, ".gitignore"));

    // Step 4: Git operations
    if (!input.skipGit) {
      operations.push("Initializing git repository");
      execSync("git init", { cwd: packagePath, stdio: "pipe" });
      execSync("git add -A", { cwd: packagePath, stdio: "pipe" });
      execSync('git commit -m "Initial commit"', {
        cwd: packagePath,
        stdio: "pipe",
      });

      operations.push("Creating GitHub repository");
      try {
        execSync(
          `gh repo create mark1russell7/${input.name} --private --source . --push`,
          { cwd: packagePath, stdio: "pipe" }
        );
        operations.push("Pushed to GitHub");
      } catch (ghError) {
        // GitHub repo might already exist or gh not available
        errors.push(`GitHub repo creation may have failed: ${ghError}`);
      }
    }

    // Step 5: Add to ecosystem manifest
    if (!input.skipManifest) {
      operations.push("Adding to ecosystem manifest");
      const manifestPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");

      if (await pathExists(manifestPath)) {
        const { readFile } = await import("node:fs/promises");
        const manifestContent = await readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(manifestContent);

        if (!manifest.packages[packageName]) {
          manifest.packages[packageName] = {
            repo: `github:mark1russell7/${input.name}#main`,
            path: input.name,
          };
          await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
          operations.push(`Added ${packageName} to ecosystem manifest`);
        } else {
          operations.push(`${packageName} already in ecosystem manifest`);
        }
      } else {
        errors.push("Ecosystem manifest not found, skipping");
      }
    }

    return {
      success: errors.length === 0,
      packageName,
      packagePath,
      created,
      operations,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      packageName,
      packagePath,
      created,
      operations,
      errors: [...errors, error instanceof Error ? error.message : String(error)],
    };
  }
}
