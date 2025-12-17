/**
 * lib.audit procedure
 *
 * Validates all registered packages against the ecosystem's projectTemplate.
 * Reads the template from ecosystem.manifest.json (single source of truth).
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { readFile, access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import type {
  LibAuditInput,
  LibAuditOutput,
  PackageAuditResult,
  PnpmIssue,
} from "../../types.js";

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
 * Package.json structure for pnpm validation
 */
interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  pnpm?: {
    onlyBuiltDependencies?: string[];
  };
}

/**
 * Check for pnpm configuration issues
 */
async function checkPnpmIssues(pkgPath: string): Promise<PnpmIssue[]> {
  const issues: PnpmIssue[] = [];

  // Check for npm lockfile (should use pnpm)
  const npmLockPath = join(pkgPath, "package-lock.json");
  if (await pathExists(npmLockPath)) {
    issues.push({
      type: "npm-lockfile",
      message: "Found package-lock.json - should use pnpm-lock.yaml instead",
    });
  }

  // Read package.json to check for GitHub deps
  const pkgJsonPath = join(pkgPath, "package.json");
  if (!(await pathExists(pkgJsonPath))) {
    return issues;
  }

  let pkgJson: PackageJson;
  try {
    const content = await readFile(pkgJsonPath, "utf-8");
    pkgJson = JSON.parse(content) as PackageJson;
  } catch {
    return issues;
  }

  // Find GitHub dependencies that need build scripts
  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };

  const githubDeps: string[] = [];
  for (const [name, version] of Object.entries(allDeps)) {
    if (version.includes("github:") || version.includes("git+") || version.includes("git://")) {
      githubDeps.push(name);
    }
  }

  if (githubDeps.length === 0) {
    return issues;
  }

  // Check if pnpm.onlyBuiltDependencies includes these packages
  const allowedBuilt = pkgJson.pnpm?.onlyBuiltDependencies ?? [];

  for (const dep of githubDeps) {
    if (!allowedBuilt.includes(dep)) {
      issues.push({
        type: "missing-onlyBuiltDependencies",
        message: `GitHub dependency "${dep}" needs pnpm.onlyBuiltDependencies entry`,
        package: dep,
      });
    }
  }

  return issues;
}

/**
 * Load ecosystem manifest
 */
async function loadManifest(rootPath: string): Promise<EcosystemManifest> {
  const manifestPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");
  const content = await readFile(manifestPath, "utf-8");
  return JSON.parse(content) as EcosystemManifest;
}

/**
 * Audit a single package against the template
 */
async function auditPackage(
  pkgPath: string,
  pkgName: string,
  template: { files: string[]; dirs: string[] },
  fix: boolean
): Promise<PackageAuditResult> {
  const missingFiles: string[] = [];
  const missingDirs: string[] = [];
  const fixedFiles: string[] = [];
  const fixedDirs: string[] = [];

  // Check required directories
  for (const dir of template.dirs) {
    const dirPath = join(pkgPath, dir);
    if (!(await pathExists(dirPath))) {
      missingDirs.push(dir);
      if (fix) {
        try {
          await mkdir(dirPath, { recursive: true });
          fixedDirs.push(dir);
        } catch {
          // Could not fix
        }
      }
    }
  }

  // Check required files
  for (const file of template.files) {
    const filePath = join(pkgPath, file);
    if (!(await pathExists(filePath))) {
      missingFiles.push(file);
      if (fix) {
        // Only fix certain files with sensible defaults
        try {
          if (file === "dependencies.json") {
            await writeFile(
              filePath,
              JSON.stringify(
                { $schema: "./node_modules/@mark1russell7/cue/dependencies/schema.json", dependencies: ["ts", "node"] },
                null,
                2
              ) + "\n"
            );
            fixedFiles.push(file);
          } else if (file === ".gitignore") {
            await writeFile(filePath, "node_modules/\ndist/\n.tsbuildinfo\n");
            fixedFiles.push(file);
          }
          // Don't auto-create package.json or tsconfig.json - those need cue-config generate
        } catch {
          // Could not fix
        }
      }
    }
  }

  // Check pnpm configuration
  const pnpmIssues = await checkPnpmIssues(pkgPath);

  // Remove fixed items from missing lists
  const stillMissingFiles = missingFiles.filter((f) => !fixedFiles.includes(f));
  const stillMissingDirs = missingDirs.filter((d) => !fixedDirs.includes(d));

  // Package is valid only if no missing files/dirs AND no pnpm issues
  const isValid = stillMissingFiles.length === 0 && stillMissingDirs.length === 0 && pnpmIssues.length === 0;

  return {
    name: pkgName,
    path: pkgPath,
    valid: isValid,
    missingFiles: stillMissingFiles,
    missingDirs: stillMissingDirs,
    pnpmIssues,
    ...(fix && fixedFiles.length > 0 ? { fixedFiles } : {}),
    ...(fix && fixedDirs.length > 0 ? { fixedDirs } : {}),
  };
}

/**
 * Audit all packages in the ecosystem against projectTemplate
 */
export async function libAudit(input: LibAuditInput): Promise<LibAuditOutput> {
  const defaultRoot = join(homedir(), "git");
  const rootPath = input.rootPath ?? defaultRoot;

  // Load manifest
  let manifest: EcosystemManifest;
  try {
    manifest = await loadManifest(rootPath);
  } catch (error) {
    return {
      success: false,
      template: { files: [], dirs: [] },
      results: [],
      summary: { total: 0, valid: 0, invalid: 0 },
    };
  }

  const resolvedRoot = resolveRoot(manifest.root);
  const template = manifest.projectTemplate;
  const results: PackageAuditResult[] = [];

  // Audit each registered package
  for (const [pkgName, entry] of Object.entries(manifest.packages)) {
    const pkgPath = join(resolvedRoot, entry.path);

    // Skip if package directory doesn't exist
    if (!(await pathExists(pkgPath))) {
      results.push({
        name: pkgName,
        path: pkgPath,
        valid: false,
        missingFiles: ["(package not cloned)"],
        missingDirs: [],
        pnpmIssues: [],
      });
      continue;
    }

    const result = await auditPackage(pkgPath, pkgName, template, input.fix);
    results.push(result);
  }

  const validCount = results.filter((r) => r.valid).length;
  const invalidCount = results.filter((r) => !r.valid).length;

  return {
    success: invalidCount === 0,
    template,
    results,
    summary: {
      total: results.length,
      valid: validCount,
      invalid: invalidCount,
    },
  };
}
