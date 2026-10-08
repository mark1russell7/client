/**
 * lib-refresh schematic
 *
 * Refreshes a single package with dry-run support:
 * 1. Cleanup (if force): rm node_modules/, dist/, pnpm-lock.yaml
 * 2. pnpm install
 * 3. pnpm build
 * 4. git commit/push (if not skipGit)
 */

import {
  Tree,
  chain,
  SchematicsException,
} from "@angular-devkit/schematics";
import type { Rule, SchematicContext } from "@angular-devkit/schematics";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

export interface LibRefreshOptions {
  packagePath: string;
  packageName: string;
  force?: boolean;
  skipGit?: boolean;
  dryRun?: boolean;
}

export interface RefreshStepResult {
  step: string;
  success: boolean;
  message: string;
  skipped?: boolean;
}

/**
 * Track operations for dry-run reporting
 */
const operations: RefreshStepResult[] = [];

function addResult(step: string, success: boolean, message: string, skipped = false): void {
  operations.push({ step, success, message, skipped });
}

/**
 * Step 1: Cleanup (remove node_modules, dist, lock file)
 */
function cleanupStep(options: LibRefreshOptions): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    if (!options.force) {
      addResult("cleanup", true, "Skipped (force not set)", true);
      return _tree;
    }

    const nodeModulesPath = join(options.packagePath, "node_modules");
    const distPath = join(options.packagePath, "dist");
    const lockPath = join(options.packagePath, "pnpm-lock.yaml");
    const tsBuildInfoPath = join(options.packagePath, "tsconfig.tsbuildinfo");

    const toDelete: string[] = [];

    if (existsSync(nodeModulesPath)) {
      toDelete.push("node_modules/");
    }
    if (existsSync(distPath)) {
      toDelete.push("dist/");
    }
    if (existsSync(lockPath)) {
      toDelete.push("pnpm-lock.yaml");
    }

    if (toDelete.length === 0) {
      addResult("cleanup", true, "Nothing to clean up");
      return _tree;
    }

    if (options.dryRun) {
      addResult("cleanup", true, `Would delete: ${toDelete.join(", ")}`);
      context.logger.info(`[DRY-RUN] Would delete: ${toDelete.join(", ")}`);
      return _tree;
    }

    // Actually delete
    try {
      if (existsSync(nodeModulesPath)) {
        rmSync(nodeModulesPath, { recursive: true, force: true });
      }
      if (existsSync(distPath)) {
        rmSync(distPath, { recursive: true, force: true });
      }
      if (existsSync(lockPath)) {
        rmSync(lockPath, { force: true });
      }
      if (existsSync(tsBuildInfoPath)) {
        rmSync(tsBuildInfoPath, { force: true });
      }
      addResult("cleanup", true, `Deleted: ${toDelete.join(", ")}`);
      context.logger.info(`Deleted: ${toDelete.join(", ")}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addResult("cleanup", false, `Failed: ${msg}`);
      throw new SchematicsException(`Cleanup failed: ${msg}`);
    }

    return _tree;
  };
}

/**
 * Step 2: pnpm install
 */
function installStep(options: LibRefreshOptions): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    if (options.dryRun) {
      addResult("install", true, "Would run: pnpm install");
      context.logger.info(`[DRY-RUN] Would run: pnpm install in ${options.packagePath}`);
      return _tree;
    }

    context.logger.info(`Running pnpm install in ${options.packagePath}`);

    try {
      execSync("pnpm install", {
        cwd: options.packagePath,
        stdio: "pipe",
        timeout: 300000, // 5 minutes
      });
      addResult("install", true, "pnpm install succeeded");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addResult("install", false, `pnpm install failed: ${msg}`);
      throw new SchematicsException(`pnpm install failed: ${msg}`);
    }

    return _tree;
  };
}

/**
 * Step 3: pnpm build
 */
function buildStep(options: LibRefreshOptions): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    if (options.dryRun) {
      addResult("build", true, "Would run: pnpm run build");
      context.logger.info(`[DRY-RUN] Would run: pnpm run build in ${options.packagePath}`);
      return _tree;
    }

    context.logger.info(`Running pnpm run build in ${options.packagePath}`);

    try {
      execSync("pnpm run build", {
        cwd: options.packagePath,
        stdio: "pipe",
        timeout: 120000, // 2 minutes
      });
      addResult("build", true, "pnpm run build succeeded");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addResult("build", false, `pnpm run build failed: ${msg}`);
      throw new SchematicsException(`pnpm run build failed: ${msg}`);
    }

    return _tree;
  };
}

/**
 * Step 4: Git operations
 */
function gitStep(options: LibRefreshOptions): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    if (options.skipGit) {
      addResult("git", true, "Skipped (skipGit set)", true);
      return _tree;
    }

    // Check if there are changes to commit
    try {
      const status = execSync("git status --porcelain", {
        cwd: options.packagePath,
        encoding: "utf-8",
      }).trim();

      if (!status) {
        addResult("git", true, "No changes to commit");
        context.logger.info("No changes to commit");
        return _tree;
      }

      if (options.dryRun) {
        addResult("git", true, "Would commit and push changes");
        context.logger.info(`[DRY-RUN] Would commit and push changes`);
        return _tree;
      }

      // Stage, commit, push
      execSync("git add -A", { cwd: options.packagePath, stdio: "pipe" });
      execSync(
        `git commit -m "Refreshed package ${options.packageName}\n\n Generated with mark lib refresh"`,
        { cwd: options.packagePath, stdio: "pipe" }
      );
      execSync("git push", { cwd: options.packagePath, stdio: "pipe" });

      addResult("git", true, "Committed and pushed changes");
      context.logger.info("Committed and pushed changes");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addResult("git", false, `Git operations failed: ${msg}`);
      throw new SchematicsException(`Git operations failed: ${msg}`);
    }

    return _tree;
  };
}

/**
 * Get the results of the refresh operation
 */
export function getRefreshResults(): RefreshStepResult[] {
  return [...operations];
}

/**
 * Clear results (call before starting a new refresh)
 */
export function clearRefreshResults(): void {
  operations.length = 0;
}

/**
 * Main schematic factory
 */
export function libRefresh(options: LibRefreshOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    // Clear previous results
    clearRefreshResults();

    context.logger.info(`Refreshing ${options.packageName} at ${options.packagePath}`);

    if (options.dryRun) {
      context.logger.info("=== DRY RUN MODE ===");
    }

    return chain([
      cleanupStep(options),
      installStep(options),
      buildStep(options),
      gitStep(options),
    ])(tree, context);
  };
}
