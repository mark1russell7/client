/**
 * Test fixtures for the ecosystem
 * 
 * Provides factory functions for creating test data.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

/**
 * Create a temporary directory for test fixtures
 */
export async function createTempDir(prefix = "test-"): Promise<string> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  return tmpDir;
}

/**
 * Clean up a temporary directory
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  await fs.promises.rm(dirPath, { recursive: true, force: true });
}

/**
 * Create a minimal package.json fixture
 */
export interface PackageJsonFixture {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function createPackageJson(options: PackageJsonFixture): object {
  return {
    name: options.name,
    version: options.version ?? "1.0.0",
    type: "module",
    dependencies: options.dependencies ?? {},
    devDependencies: options.devDependencies ?? {},
  };
}

/**
 * Write a package.json to a directory
 */
export async function writePackageJson(
  dirPath: string,
  options: PackageJsonFixture
): Promise<void> {
  const pkgPath = path.join(dirPath, "package.json");
  const content = JSON.stringify(createPackageJson(options), null, 2);
  await fs.promises.writeFile(pkgPath, content);
}

/**
 * Create a minimal TypeScript source file
 */
export async function writeTsFile(
  filePath: string,
  content: string
): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

/**
 * Initialize a git repo in a directory
 */
export async function initGitRepo(
  dirPath: string,
  options: { initialCommit?: boolean } = {}
): Promise<void> {
  const { execSync } = await import("node:child_process");
  execSync("git init", { cwd: dirPath, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', { cwd: dirPath, stdio: "pipe" });
  execSync('git config user.name "Test"', { cwd: dirPath, stdio: "pipe" });
  
  if (options.initialCommit) {
    execSync("git add -A", { cwd: dirPath, stdio: "pipe" });
    execSync('git commit -m "initial" --allow-empty', { cwd: dirPath, stdio: "pipe" });
  }
}
