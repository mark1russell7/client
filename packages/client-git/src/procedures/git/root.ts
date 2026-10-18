/**
 * Git under the root of the files of a host (roadmap R33, tracker item O35).
 *
 * A host with a root (`confineToRoot()` of `@procedures/fs`) examines the path inputs of each
 * `git.*` procedure, and it gives the handler the root in `ctx.fsRoot`. The handler then runs in
 * `underGitRoot()`, and each `git()` call of the handler gets these changes:
 *
 * - The working folder must be in the root. `GIT_CEILING_DIRECTORIES` is the parent of the root, so
 *   git does not look for a repository above the root.
 * - The configuration of the system does not apply (`GIT_CONFIG_NOSYSTEM`). The global
 *   configuration is a file of this process with only the identity of the user of the host
 *   (`GIT_CONFIG_GLOBAL`). The variables that move the repository (`GIT_DIR`, `GIT_WORK_TREE` and
 *   the others) do not apply.
 * - The options of `SAFE_CONFIG` turn off the hooks, `core.fsmonitor`, the transports `file` and
 *   `ext` (and each transport other than https, http, ssh and git), and the recursion into
 *   submodules.
 * - Before the first git command in a folder, `examineRepository()` examines the repository: its
 *   folders must be in the root, and its configuration must not start a program
 *   (`refusedConfigKeys()`). A repository with submodules is refused.
 *
 * A refusal is `FORBIDDEN` with the reason `outside-root`. Without a root, nothing changes.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { rmSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import type { ProcedurePath } from "@procedures/client";
import { inRoot, isInside, outsideRoot, realPathOf, resolveRoot, type ResolvedRoot } from "@procedures/fs/root";
import { runCommand } from "@procedures/shell/command";

/** The root of one call of a git procedure. */
export interface GitRoot {
  /** The root, and its real path. */
  readonly root: ResolvedRoot;
  /** The procedure, for the errors. */
  readonly procedure: ProcedurePath;
  /** The examinations of the repositories, by working folder. One call examines a folder one time. */
  readonly examined: Map<string, Promise<void>>;
}

const roots = new AsyncLocalStorage<GitRoot>();

/**
 * This function runs the handler of a git procedure. With a root, each `git()` call of the handler
 * stays in the root. Without a root, it only runs the handler.
 */
export async function underGitRoot<T>(folder: string | undefined, procedure: ProcedurePath, handler: () => Promise<T>): Promise<T> {
  if (folder === undefined) return handler();
  const root = await resolveRoot(folder, "the git procedures");
  return roots.run({ root, procedure, examined: new Map() }, handler);
}

/** This function gives the root of the current call, or undefined without a root. */
export function currentGitRoot(): GitRoot | undefined {
  return roots.getStore();
}

/**
 * This function gives the absolute path of a path that a git procedure makes from its input, for
 * example the folder of a clone. Under a root, a path outside the root is refused.
 */
export async function pathInGitRoot(path: string): Promise<string> {
  const current = currentGitRoot();
  if (current === undefined) return resolve(path);
  return inRoot(current.root, path, current.procedure);
}

/**
 * This function refuses, under a root, the URL of a remote that starts a program: the form
 * `<transport>::<address>` starts the remote helper `git-remote-<transport>`, and `ext::` starts
 * a command.
 */
export function remoteUrlInGitRoot(url: string): string {
  const current = currentGitRoot();
  if (current !== undefined && url.includes("::")) {
    throw outsideRoot(current.procedure, `under the root ${current.root.folder}, a remote URL with "::" is refused, because it starts a program: ${url}`);
  }
  return url;
}

// =============================================================================
// The command line and the environment of git under a root
// =============================================================================

/**
 * The configuration of each git command under a root, as `-c` options. A `-c` option overrides each
 * configuration file. Git gives these options to the git commands that it starts.
 */
export function safeConfig(hooks: string): string[] {
  return [
    // No hook runs: the folder is empty
    `core.hooksPath=${hooks}`,
    "core.fsmonitor=false",
    // Only the network transports: no local path, no file://, no ext:: and no remote helper. The
    // rule of a transport overrides protocol.allow, so file and ext get their own rule.
    "protocol.allow=never",
    "protocol.file.allow=never",
    "protocol.ext.allow=never",
    "protocol.https.allow=always",
    "protocol.http.allow=always",
    "protocol.ssh.allow=always",
    "protocol.git.allow=always",
    // Git does not start git in a submodule
    "diff.ignoreSubmodules=all",
    "submodule.recurse=false",
    "fetch.recurseSubmodules=false",
    "push.recurseSubmodules=no",
    "status.submoduleSummary=false",
  ].flatMap((option) => ["-c", option]);
}

/**
 * The variables of the environment that move the repository, add configuration or allow a
 * transport. Under a root, git does not get them.
 */
const REMOVED_VARIABLES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_PREFIX",
  "GIT_GRAFT_FILE",
  "GIT_SHALLOW_FILE",
  "GIT_CONFIG",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_EXTERNAL_DIFF",
  "GIT_TEMPLATE_DIR",
  "GIT_ATTR_SOURCE",
  "GIT_ALLOW_PROTOCOL",
] as const;

/** The folders of `GIT_CEILING_DIRECTORIES` for a root: the parent of the root, as given and as its real path. */
export function ceilingOf(root: ResolvedRoot): string {
  const parents = new Set<string>();
  for (const folder of [root.folder, root.real]) {
    const parent = dirname(folder);
    // A root at the top of a drive has no parent
    if (parent !== folder) parents.add(parent);
  }
  return [...parents].join(delimiter);
}

/** This function gives the environment of git under a root. */
export function rootEnvironment(root: ResolvedRoot, setup: GitRootSetup): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const name of REMOVED_VARIABLES) env[name] = undefined;
  env["GIT_CEILING_DIRECTORIES"] = ceilingOf(root);
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  env["GIT_CONFIG_GLOBAL"] = setup.globalConfig;
  // No prompt for a password: the call has no terminal
  env["GIT_TERMINAL_PROMPT"] = "0";
  return env;
}

/** The files of this process for git under a root. */
export interface GitRootSetup {
  /** An empty folder: the hooks folder of each repository under a root. */
  readonly hooks: string;
  /** The global configuration under a root: only the identity of the user of the host. */
  readonly globalConfig: string;
}

/** The keys of the global configuration that git under a root keeps. They start no program. */
const KEPT_GLOBAL_KEYS = ["user.name", "user.email", "init.defaultBranch"] as const;

let setup: Promise<GitRootSetup> | undefined;

/**
 * This function makes the files of git under a root one time for each process: a new folder in
 * the temporary folder, with an empty hooks folder and a global configuration. The configuration
 * has only the identity of the user from the global configuration of the host, so a commit works.
 * The process deletes the folder at its end.
 */
export function gitRootSetup(): Promise<GitRootSetup> {
  setup ??= makeSetup().catch((error: unknown) => {
    setup = undefined;
    throw error;
  });
  return setup;
}

async function makeSetup(): Promise<GitRootSetup> {
  const folder = await mkdtemp(join(tmpdir(), "procedures-git-root-"));
  process.once("exit", () => rmSync(folder, { recursive: true, force: true }));
  const hooks = join(folder, "hooks");
  await mkdir(hooks);
  const globalConfig = join(folder, "global.gitconfig");
  await writeFile(globalConfig, "");
  for (const key of KEPT_GLOBAL_KEYS) {
    const value = await runCommand("git", { args: ["config", "--global", "--get", key], cwd: folder });
    if (!value.success) continue;
    // Git writes the value, so a special character of the value stays correct
    await runCommand("git", { args: ["config", "--file", globalConfig, key, value.stdout.replace(/\r?\n$/, "")], cwd: folder });
  }
  return { hooks, globalConfig };
}

// =============================================================================
// The configuration of a repository
// =============================================================================

/** The keys (section.name, or section.subsection.name as section.*.name) that start a program or name a file outside the repository. */
const REFUSED_KEYS: ReadonlySet<string> = new Set([
  // Programs
  "core.sshcommand",
  "core.gitproxy",
  "core.askpass",
  "core.editor",
  "core.pager",
  "core.alternaterefscommand",
  "sequence.editor",
  "diff.external",
  "diff.tool",
  "diff.guitool",
  "merge.tool",
  "merge.guitool",
  "credential.helper",
  "credential.*.helper",
  "gpg.program",
  "gpg.*.program",
  "gpg.ssh.defaultkeycommand",
  "filter.*.clean",
  "filter.*.smudge",
  "filter.*.process",
  "diff.*.command",
  "diff.*.textconv",
  "merge.*.driver",
  "difftool.*.cmd",
  "difftool.*.path",
  "mergetool.*.cmd",
  "mergetool.*.path",
  "remote.*.uploadpack",
  "remote.*.receivepack",
  "remote.*.vcs",
  "uploadpack.packobjectshook",
  "trailer.*.command",
  "trailer.*.cmd",
  // Files outside the repository
  "core.worktree",
  "core.excludesfile",
  "core.attributesfile",
  "commit.template",
  "include.path",
  "includeif.*.path",
  "init.templatedir",
  "mailmap.file",
  "blame.ignorerevsfile",
  "diff.orderfile",
  "gpg.ssh.allowedsignersfile",
  // A bundle URI can be a local file
  "fetch.bundleuri",
  "transfer.bundleuri",
  ...["sslcert", "sslkey", "sslcainfo", "sslcapath", "cookiefile", "proxysslcert", "proxysslkey", "proxysslcainfo"].flatMap((name) => [
    `http.${name}`,
    `http.*.${name}`,
  ]),
]);

/**
 * The sections that a root refuses as a whole: `pager.<command>` and the hooks of the
 * configuration start a program, `protocol.*` allows a transport again, and a bundle URI can be
 * a local file.
 */
const REFUSED_SECTIONS: ReadonlySet<string> = new Set(["pager", "hook", "protocol", "bundle"]);

/** The keys that start the signing program when they are not false. */
const SIGNING_KEYS: ReadonlySet<string> = new Set(["commit.gpgsign", "tag.gpgsign", "tag.forcesignannotated", "push.gpgsign"]);

/** The values that turn off a boolean key. */
const FALSE_VALUES: ReadonlySet<string> = new Set(["false", "no", "off", "0"]);

/** The parts of a configuration key: the section and the name in lower case, and the subsection. */
function partsOf(key: string): { section: string; subsection: string | undefined; name: string } {
  const first = key.indexOf(".");
  const last = key.lastIndexOf(".");
  if (first === -1) return { section: key.toLowerCase(), subsection: undefined, name: "" };
  return {
    section: key.slice(0, first).toLowerCase(),
    subsection: first === last ? undefined : key.slice(first + 1, last),
    name: key.slice(last + 1).toLowerCase(),
  };
}

/** True when a key of the configuration of a repository starts a program or names a file outside it. */
export function isRefusedConfigKey(key: string, value: string | undefined): boolean {
  const { section, subsection, name } = partsOf(key);
  if (REFUSED_SECTIONS.has(section)) return true;
  const pattern = subsection === undefined ? `${section}.${name}` : `${section}.*.${name}`;
  if (REFUSED_KEYS.has(pattern)) return true;
  // gpg.ssh.defaultKeyCommand and gpg.ssh.allowedSignersFile have a fixed subsection
  if (subsection !== undefined && REFUSED_KEYS.has(`${section}.${subsection.toLowerCase()}.${name}`)) return true;
  if (SIGNING_KEYS.has(pattern)) return !FALSE_VALUES.has((value ?? "true").trim().toLowerCase());
  // A remote helper: `<transport>::<address>`, also as the base of url.<base>.insteadOf
  if (section === "remote" && (name === "url" || name === "pushurl")) return (value ?? "").includes("::");
  if (section === "url" && (subsection ?? "").includes("::")) return true;
  // `!command` as the update of a submodule
  if (section === "submodule" && name === "update") return (value ?? "").trim().startsWith("!");
  return false;
}

/** One entry of `git config --list --show-scope -z`. */
export interface ConfigEntry {
  readonly scope: string;
  readonly key: string;
  readonly value: string | undefined;
}

/** This function reads the output of `git config --list --show-scope -z`: the scope, then the key and the value. */
export function parseConfigList(output: string): ConfigEntry[] {
  const fields = output.split("\0");
  const entries: ConfigEntry[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const scope = fields[i]!;
    const entry = fields[i + 1]!;
    const newline = entry.indexOf("\n");
    entries.push(newline === -1 ? { scope, key: entry, value: undefined } : { scope, key: entry.slice(0, newline), value: entry.slice(newline + 1) });
  }
  return entries;
}

/**
 * This function gives the keys of the configuration of a repository that a root refuses. It
 * examines the files of the repository (the scopes `local` and `worktree`), not the global
 * configuration of this process and not the `-c` options.
 */
export function refusedConfigKeys(entries: readonly ConfigEntry[]): string[] {
  const refused = new Set<string>();
  for (const entry of entries) {
    if (entry.scope === "global" || entry.scope === "command") continue;
    if (isRefusedConfigKey(entry.key, entry.value)) refused.add(entry.key);
  }
  return [...refused];
}

// =============================================================================
// The examination of a repository
// =============================================================================

/** This function runs git for an examination, with the environment of the root. */
async function examine(args: string[], cwd: string, env: Record<string, string | undefined>, hooks: string, input?: string) {
  return runCommand("git", { args: [...safeConfig(hooks), ...args], cwd, env, input });
}

/** True when the real path of a path is in the root. */
async function isInRoot(root: ResolvedRoot, path: string): Promise<boolean> {
  return isInside(root.real, await realPathOf(path));
}

/** True when a file or a folder exists. */
async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** True when a folder has the files of a git folder: `HEAD`, `objects` and `refs`, as a bare repository has. */
async function isGitFolder(folder: string): Promise<boolean> {
  for (const name of ["HEAD", "objects", "refs"]) if (!(await exists(join(folder, name)))) return false;
  return true;
}

/**
 * True when a folder from the working folder up to the root has `.git`, or is a git folder. Git
 * then found a repository that it could not examine.
 */
async function looksLikeRepository(cwd: string, root: string): Promise<boolean> {
  let folder = cwd;
  for (;;) {
    if ((await exists(join(folder, ".git"))) || (await isGitFolder(folder))) return true;
    const parent = dirname(folder);
    if (!isInside(root, parent) || parent === folder) return false;
    folder = parent;
  }
}

/**
 * This function examines the repository of a working folder under a root. It refuses:
 * - a repository whose folders are outside the root (a `.git` file can name another folder);
 * - an alternate object folder outside the root;
 * - a configuration with a key that starts a program or names a file outside the repository;
 * - a repository with submodules: git starts git in each submodule, with its configuration.
 *
 * A folder that is not in a repository passes: the command makes one (`git init`, `git clone`),
 * or it fails.
 */
export async function examineRepository(current: GitRoot, cwd: string, env: Record<string, string | undefined>, hooks: string): Promise<void> {
  const { root, procedure } = current;
  const refuse = (message: string) => outsideRoot(procedure, `under the root ${root.folder}, ${message}`);

  const located = await examine(["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir", "--is-bare-repository"], cwd, env, hooks);
  const [gitDir, commonDir, bare] = located.success ? located.stdout.split(/\r?\n/) : [];
  if (!gitDir || !commonDir) {
    // The text of the error of git depends on the language, so the folders decide
    if (await looksLikeRepository(cwd, root.folder)) {
      throw refuse(`git cannot examine the repository of ${cwd}: ${located.stderr.trim()}`);
    }
    return;
  }

  for (const path of [gitDir, commonDir, join(commonDir, "objects"), join(commonDir, "refs"), join(commonDir, "config"), join(gitDir, "index")]) {
    if (!(await isInRoot(root, path))) throw refuse(`the repository of ${cwd} is outside the root: ${path}`);
  }

  const alternates = await readFile(join(commonDir, "objects", "info", "alternates"), "utf8").catch(() => "");
  for (const line of alternates.split(/\r?\n/)) {
    const entry = line.trim();
    if (entry === "" || entry.startsWith("#")) continue;
    if (!(await isInRoot(root, resolve(commonDir, "objects", entry)))) throw refuse(`the repository ${gitDir} reads objects outside the root: ${entry}`);
  }

  const config = await examine(["config", "--list", "--no-includes", "--show-scope", "-z"], cwd, env, hooks);
  if (!config.success) throw refuse(`git cannot read the configuration of the repository ${gitDir}: ${config.stderr.trim()}`);
  const keys = refusedConfigKeys(parseConfigList(config.stdout));
  if (keys.length > 0) {
    throw refuse(`the configuration of the repository ${gitDir} can start a program or read a file outside the root: ${keys.join(", ")}`);
  }

  // A submodule: .gitmodules in the working tree, in the index or at HEAD
  let modules = false;
  if (bare !== "true") {
    const top = await examine(["rev-parse", "--show-toplevel"], cwd, env, hooks);
    if (top.success && (await exists(join(top.stdout.trim(), ".gitmodules")))) modules = true;
  }
  if (!modules) {
    const objects = await examine(["cat-file", "--batch-check"], cwd, env, hooks, ":.gitmodules\nHEAD:.gitmodules\n");
    if (!objects.success) throw refuse(`git cannot examine the repository ${gitDir}: ${objects.stderr.trim()}`);
    modules = objects.stdout.split(/\r?\n/).some((line) => line !== "" && !line.endsWith(" missing"));
  }
  if (modules) {
    throw refuse(`the repository ${gitDir} has submodules (.gitmodules), and git starts git in each submodule with the configuration of the submodule`);
  }
}

/** The subcommands that recurse into submodules without `--no-recurse-submodules`. */
const RECURSING = new Set(["fetch", "pull"]);

/**
 * This function gives the arguments, the working folder and the environment of one git command
 * under a root. It examines the repository of the working folder before the first command there.
 */
export async function confinedGitCommand(
  current: GitRoot,
  args: readonly string[],
  cwd: string | undefined,
  env: Record<string, string | undefined> | undefined,
): Promise<{ args: string[]; cwd: string; env: Record<string, string | undefined> }> {
  const folder = await inRoot(current.root, cwd ?? current.root.folder, current.procedure);
  const files = await gitRootSetup();
  const rootEnv = rootEnvironment(current.root, files);
  let examined = current.examined.get(folder);
  if (examined === undefined) {
    examined = examineRepository(current, folder, rootEnv, files.hooks);
    current.examined.set(folder, examined);
  }
  await examined;

  const command = [...args];
  // The checkout shows the changes of the working tree, also of a submodule that it brings: quiet, it does not
  if (command[0] === "checkout") command.splice(1, 0, "--quiet");
  if (RECURSING.has(command[0] ?? "")) command.splice(1, 0, "--no-recurse-submodules");
  return { args: [...safeConfig(files.hooks), ...command], cwd: folder, env: { ...rootEnv, ...env } };
}
