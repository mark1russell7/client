/**
 * lib.audit procedure
 *
 * Validates the workspace packages against the package template, and checks for
 * pnpm settings that do not work in a workspace.
 */

import { basename, join } from "node:path";
import { PROCEDURE_REGISTRY, type AnyProcedure, type ProcedureContext } from "@mark1russell7/client";
import type {
  FlagNotice,
  LibAuditInput,
  LibAuditOutput,
  PackageAuditResult,
  PnpmIssue,
} from "../../types.js";
import { libScan } from "./scan.js";
import { resolveWorkspaceRoot } from "../../workspace.js";
import { CLI_GLOBAL_FLAGS } from "../../cli-flags.js";

interface FsExistsOutput { exists: boolean; path: string; }
interface FsReadJsonOutput { path: string; data: unknown; }
interface FsWriteOutput { path: string; bytesWritten: number; }
interface FsMkdirOutput { path: string; created: boolean; }

/**
 * The files and folders every client package has. dist/ is not in the list:
 * it is build output and does not exist before `pnpm build`.
 */
export const PACKAGE_TEMPLATE: { files: string[]; dirs: string[] } = {
  files: ["package.json", "tsconfig.json", "dependencies.json", ".gitignore"],
  dirs: ["src"],
};

/**
 * Folders under packages/ that are not client packages.
 * packages/cli holds the repository tool from the template, which does not use cue-config.
 */
const NOT_CLIENT_PACKAGES = new Set(["cli"]);

/**
 * Check if path exists
 */
async function pathExists(pathStr: string, ctx: ProcedureContext): Promise<boolean> {
  try {
    const result = await ctx.client.call<{ path: string }, FsExistsOutput>(
      ["fs", "exists"],
      { path: pathStr }
    );
    return result.exists;
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
  peerDependencies?: Record<string, string>;
  pnpm?: unknown;
}

/**
 * Check for pnpm configuration that does not work in a workspace
 */
async function checkPnpmIssues(
  pkgPath: string,
  workspacePackages: Set<string>,
  ctx: ProcedureContext
): Promise<PnpmIssue[]> {
  const issues: PnpmIssue[] = [];

  if (await pathExists(join(pkgPath, "package-lock.json"), ctx)) {
    issues.push({
      type: "npm-lockfile",
      message: "Found package-lock.json - the workspace uses the root pnpm-lock.yaml",
    });
  }
  if (await pathExists(join(pkgPath, "pnpm-lock.yaml"), ctx)) {
    issues.push({
      type: "package-lockfile",
      message: "Found a per-package pnpm-lock.yaml - the workspace uses the root pnpm-lock.yaml",
    });
  }

  let pkgJson: PackageJson;
  try {
    const result = await ctx.client.call<{ path: string }, FsReadJsonOutput>(
      ["fs", "read.json"],
      { path: join(pkgPath, "package.json") }
    );
    pkgJson = result.data as PackageJson;
  } catch {
    return issues;
  }

  if (pkgJson.pnpm !== undefined) {
    issues.push({
      type: "ignored-pnpm-field",
      message: 'The "pnpm" field of a workspace package is ignored - use the root pnpm-workspace.yaml',
    });
  }

  // A dependency on another workspace package must use the workspace link, not a git reference
  for (const deps of [pkgJson.dependencies, pkgJson.devDependencies, pkgJson.peerDependencies]) {
    for (const [name, spec] of Object.entries(deps ?? {})) {
      if (workspacePackages.has(name) && !spec.startsWith("workspace:")) {
        issues.push({
          type: "not-workspace-link",
          message: `"${name}" is a workspace package but the dependency is "${spec}" - use "workspace:*"`,
          package: name,
        });
      }
    }
  }

  return issues;
}

/**
 * Audit a single package against the template
 */
async function auditPackage(
  pkgPath: string,
  pkgName: string,
  template: { files: string[]; dirs: string[] },
  workspacePackages: Set<string>,
  fix: boolean,
  ctx: ProcedureContext
): Promise<PackageAuditResult> {
  const missingFiles: string[] = [];
  const missingDirs: string[] = [];
  const fixedFiles: string[] = [];
  const fixedDirs: string[] = [];

  // Check required directories
  for (const dir of template.dirs) {
    const dirPath = join(pkgPath, dir);
    if (!(await pathExists(dirPath, ctx))) {
      missingDirs.push(dir);
      if (fix) {
        try {
          await ctx.client.call<{ path: string; recursive?: boolean }, FsMkdirOutput>(
            ["fs", "mkdir"],
            { path: dirPath, recursive: true }
          );
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
    if (!(await pathExists(filePath, ctx))) {
      missingFiles.push(file);
      if (fix) {
        // Only fix certain files with sensible defaults
        try {
          if (file === "dependencies.json") {
            await ctx.client.call<{ path: string; content: string }, FsWriteOutput>(
              ["fs", "write"],
              {
                path: filePath,
                content: JSON.stringify(
                  { $schema: "./node_modules/@mark1russell7/cue/dependencies/schema.json", dependencies: ["ts", "node"] },
                  null,
                  2
                ) + "\n"
              }
            );
            fixedFiles.push(file);
          } else if (file === ".gitignore") {
            await ctx.client.call<{ path: string; content: string }, FsWriteOutput>(
              ["fs", "write"],
              { path: filePath, content: "node_modules/\ndist/\n.tsbuildinfo\n" }
            );
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
  const pnpmIssues = await checkPnpmIssues(pkgPath, workspacePackages, ctx);

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
 * The field names of a procedure's input schema (a Zod object, also through zodAdapter)
 */
function inputFieldNames(schema: unknown): string[] {
  const node = schema as { shape?: unknown; _def?: { shape?: () => Record<string, unknown> } } | undefined;
  if (node?.shape && typeof node.shape === "object") {
    return Object.keys(node.shape);
  }
  if (typeof node?._def?.shape === "function") {
    return Object.keys(node._def.shape());
  }
  return [];
}

/**
 * The procedure flags that hide a global flag of `mark` after the command path. `mark` gives a
 * flag after the path to the procedure when the procedure declares it, so the user must give
 * the global flag before the command. The server options (`--port`, `--host`, `--transport`)
 * are not reported: they are global only with `--server`, which takes no command.
 */
export function findFlagNotices(procedures: readonly AnyProcedure[]): FlagNotice[] {
  const notices: FlagNotice[] = [];
  const globals = CLI_GLOBAL_FLAGS.filter((flag) => !flag.serverOption);
  for (const procedure of procedures) {
    const name = procedure.path.join(" ");
    const shorts = ((procedure.metadata ?? {}) as { shorts?: Record<string, string> }).shorts ?? {};
    for (const [field, letter] of Object.entries(shorts)) {
      const global = globals.find((flag) => flag.short === letter);
      if (global) {
        notices.push({ procedure: name, flag: `-${letter} (${field})`, global: `-${letter} (--${global.long})` });
      }
    }
    for (const field of inputFieldNames(procedure.input)) {
      const kebab = field.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
      const global = globals.find((flag) => flag.long === field || flag.long === kebab);
      if (global) {
        notices.push({ procedure: name, flag: `--${kebab}`, global: `--${global.long}` });
      }
    }
  }
  return notices;
}

/**
 * Audit all client packages of the workspace against the package template. The result also
 * lists the procedure flags that hide a global flag of `mark` (information only).
 */
export async function libAudit(input: LibAuditInput, ctx: ProcedureContext): Promise<LibAuditOutput> {
  const template = PACKAGE_TEMPLATE;
  const flagNotices = findFlagNotices(PROCEDURE_REGISTRY.getAll());
  const empty: LibAuditOutput = {
    success: false,
    flagNotices,
    template,
    results: [],
    summary: { total: 0, valid: 0, invalid: 0 },
  };

  let rootPath: string;
  try {
    rootPath = resolveWorkspaceRoot(input.rootPath);
  } catch {
    return empty;
  }

  const scan = await libScan({ rootPath }, ctx);
  const workspacePackages = new Set(Object.keys(scan.packages));
  const results: PackageAuditResult[] = [];

  for (const info of Object.values(scan.packages)) {
    if (NOT_CLIENT_PACKAGES.has(basename(info.repoPath))) {
      continue;
    }
    results.push(await auditPackage(info.repoPath, info.name, template, workspacePackages, input.fix, ctx));
  }

  const validCount = results.filter((r) => r.valid).length;
  const invalidCount = results.filter((r) => !r.valid).length;

  return {
    success: invalidCount === 0,
    flagNotices,
    template,
    results,
    summary: {
      total: results.length,
      valid: validCount,
      invalid: invalidCount,
    },
  };
}
