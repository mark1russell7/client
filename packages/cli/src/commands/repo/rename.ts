import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { execSync } from "node:child_process";
import * as p from "@clack/prompts";
import { repoRoot } from "../../paths.ts";

const SCOPE_RE = /^[a-z0-9][a-z0-9-]*$/;
const TEMPLATE_SCOPE = "template";

/** The extensions of the text files that the rename examines. */
const TEXT_EXT_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|yml|yaml|cue|html|css)$/;

/** The folders that the rename does not enter: build output, installed packages and tool state. */
const SKIPPED_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git", ".claude", ".turbo", ".vite"]);

/** The files that the rename does not change. `pnpm install` writes the lockfile again. */
const SKIPPED_FILES = new Set(["pnpm-lock.yaml"]);

interface ParsedArgs {
  scope: string | undefined;
  dryRun: boolean;
  reinitGit: boolean;
  force: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  let scope: string | undefined;
  let dryRun = false;
  let reinitGit = false;
  let force = false;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--reinit-git") reinitGit = true;
    else if (a === "--force") force = true;
    else if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    else if (!scope) scope = a;
    else throw new Error(`Unexpected positional argument: ${a}`);
  }
  return { scope, dryRun, reinitGit, force };
}

export interface FileChange {
  path: string;
  before: string;
  after: string;
}

/**
 * The names of the packages of the workspace, without the scope. The rename changes only the
 * references to these packages. A package of the scope that is not in the workspace keeps
 * its name: it is a package of another repository (for example `@mark1russell7/cue`).
 */
export async function workspacePackageNames(root: string, scope: string): Promise<Set<string>> {
  const names = new Set<string>();
  const packagesDir = resolve(root, "packages");
  if (!existsSync(packagesDir)) return names;
  const prefix = `@${scope}/`;
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = resolve(packagesDir, entry.name, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { name?: string };
    if (pkg.name?.startsWith(prefix)) names.add(pkg.name.slice(prefix.length));
  }
  return names;
}

/**
 * The text with each reference to a workspace package moved to the new scope. In a
 * `package.json` file, the name `<scope>-monorepo` also changes.
 */
export function rewriteText(
  raw: string,
  fromScope: string,
  toScope: string,
  names: ReadonlySet<string>,
  isPackageJson: boolean,
): string {
  const escaped = fromScope.replace(/[-]/g, "\\-");
  let updated = raw.replace(new RegExp(`@${escaped}/([a-z0-9][a-z0-9._-]*)`, "g"), (match, captured: string) => {
    // A dot at the end of a sentence is not part of the name
    let name = captured;
    while (!names.has(name) && name.endsWith(".")) name = name.slice(0, -1);
    if (!names.has(name)) return match;
    return `@${toScope}/${name}${captured.slice(name.length)}`;
  });
  if (isPackageJson) {
    updated = updated.split(`"${fromScope}-monorepo"`).join(`"${toScope}-monorepo"`);
  }
  return updated;
}

async function walk(dir: string, visit: (path: string) => Promise<void>): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) await walk(path, visit);
      continue;
    }
    if (entry.isFile() && TEXT_EXT_RE.test(entry.name) && !SKIPPED_FILES.has(entry.name)) {
      await visit(path);
    }
  }
}

/**
 * The changes of a rename from one scope to another: each text file of the repository
 * (source, tests, configuration files, `tsconfig.json`, documents and workflows). The folders
 * of `SKIPPED_DIRS` and the lockfile stay as they are.
 */
export async function planRename(root: string, fromScope: string, toScope: string): Promise<FileChange[]> {
  const names = await workspacePackageNames(root, fromScope);
  const changes: FileChange[] = [];
  await walk(root, async (path) => {
    const raw = await readFile(path, "utf8");
    const updated = rewriteText(raw, fromScope, toScope, names, path.endsWith("package.json"));
    if (updated !== raw) changes.push({ path, before: raw, after: updated });
  });
  return changes;
}

async function reinitGit(): Promise<void> {
  const gitDir = resolve(repoRoot, ".git");
  if (existsSync(gitDir)) {
    const ok = await p.confirm({
      message: "About to delete .git and reinitialize. This wipes all history. Continue?",
      initialValue: false,
    });
    if (p.isCancel(ok) || !ok) {
      p.log.warn("Skipped git reinit.");
      return;
    }
    await rm(gitDir, { recursive: true, force: true });
  }
  execSync("git init", { cwd: repoRoot, stdio: "inherit" });
  p.log.success("Initialized fresh git repository.");
}

export async function renameRepo(args: string[]): Promise<void> {
  const { scope: rawScope, dryRun, reinitGit: reinit, force } = parseArgs(args);

  const rootPath = resolve(repoRoot, "package.json");
  const rootRaw = await readFile(rootPath, "utf8");
  const rootPkg = JSON.parse(rootRaw) as { name?: string };
  const currentName = rootPkg.name ?? "";
  if (!currentName.endsWith("-monorepo")) {
    throw new Error(
      `Root package.json name "${currentName}" does not end with "-monorepo"; cannot derive current scope.`,
    );
  }
  const currentScope = currentName.slice(0, -"-monorepo".length);

  if (currentScope !== TEMPLATE_SCOPE && !force) {
    throw new Error(
      `Repo already initialized (current scope: "${currentScope}"). Pass --force to re-init.`,
    );
  }

  let scope = rawScope;
  if (!scope) {
    const answer = await p.text({
      message: "Scope for this repo (will become @<scope>/<package>):",
      validate: (v) =>
        SCOPE_RE.test(v ?? "")
          ? undefined
          : "lowercase letters, digits, hyphens; must start with letter/digit",
    });
    if (p.isCancel(answer)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    scope = answer;
  }

  if (!SCOPE_RE.test(scope)) {
    throw new Error(`Invalid scope "${scope}". Allowed: ^[a-z0-9][a-z0-9-]*$`);
  }
  if (scope === currentScope) {
    throw new Error(`Scope is already "${scope}"; nothing to do.`);
  }

  const allChanges = await planRename(repoRoot, currentScope, scope);

  if (allChanges.length === 0) {
    p.log.warn(`No files reference a workspace package "@${currentScope}/..." or "${currentScope}-monorepo".`);
  } else if (dryRun) {
    p.log.info(`(dry-run) Would rewrite "@${currentScope}/" → "@${scope}/" in ${allChanges.length} file(s):`);
    for (const c of allChanges) p.log.info(`  ${relative(repoRoot, c.path)}`);
  } else {
    await Promise.all(allChanges.map((c) => writeFile(c.path, c.after)));
    p.log.success(`Rewrote ${allChanges.length} file(s): "@${currentScope}/" → "@${scope}/"`);
    for (const c of allChanges) p.log.info(`  ${relative(repoRoot, c.path)}`);
  }

  if (reinit) {
    if (dryRun) {
      p.log.info("(dry-run) Would delete .git and run 'git init'.");
    } else {
      await reinitGit();
    }
  }

  if (!dryRun && allChanges.length > 0) {
    p.log.info("Run 'pnpm install' to refresh the workspace.");
  }
}
