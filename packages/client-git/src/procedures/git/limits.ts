/**
 * Git under a capability that does not permit `process` (tracker item O110).
 *
 * A git procedure that does not write `process` starts only git, a fixed program. But git can
 * start programs that the repository chooses: the hooks, `core.fsmonitor` when git reads the index,
 * a clean filter of `.gitattributes` when git refreshes the index, `diff.external` and textconv in
 * a diff, and the configuration of a submodule. That is code of the project, so it is `process`
 * (rule 12 of CAPABILITIES-2026-10).
 *
 * When the capability of a call does not permit `process`, each `git()` call of the handler gets
 * these changes:
 *
 * - The options of `noProgramConfig()` turn off the hooks, `core.fsmonitor`, `ext::`, the remote
 *   helpers and the recursion into submodules.
 * - Before the first git command in a folder, `examineForLimits()` examines the repository. A key
 *   of its configuration that starts a program (`startsProgram()`) is refused, also in a file that
 *   the configuration includes. A repository with submodules is refused.
 *
 * When the capability does not permit `network` reads and `fs` writes, git does not fetch a
 * missing object of a partial clone (`GIT_NO_LAZY_FETCH`).
 *
 * A refusal is `FORBIDDEN` with the reason `effects-exceeded`. Under a root, the root already
 * examines the repository with a stricter rule, so only `GIT_NO_LAZY_FETCH` applies. The
 * configuration of the host (system and global) applies: its programs are programs of the host.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { join, resolve } from "node:path";
import { InvocationError, permitsEffects, type Capability, type ProcedurePath } from "@procedures/client";
import { runCommand } from "@procedures/shell/command";
import { exists, gitRootSetup, noProgramConfig, parseConfigList, refusedConfigKeys, startsProgram } from "./root.js";

/** The limits of one call of a git procedure. */
export interface GitLimits {
  /** The capability does not permit `process`: git starts no program of the repository. */
  readonly noProgram: boolean;
  /** The capability does not permit `network` reads and `fs` writes: git fetches no missing object. */
  readonly noLazyFetch: boolean;
  /** The procedure, for the errors. */
  readonly procedure: ProcedurePath;
  /** The examinations of the repositories, by working folder. One call examines a folder one time. */
  readonly examined: Map<string, Promise<void>>;
}

const limits = new AsyncLocalStorage<GitLimits>();

/** This function gives the limits of a capability for git. */
export function gitLimitsOf(capability: Capability<unknown> | undefined): { noProgram: boolean; noLazyFetch: boolean } {
  return {
    noProgram: !permitsEffects(capability, { writes: ["process"] }),
    noLazyFetch: !permitsEffects(capability, { reads: ["network"], writes: ["fs"] }),
  };
}

/**
 * This function runs the handler of a git procedure under the limits of its capability. When the
 * capability permits `process`, `network` and `fs`, it only runs the handler.
 */
export function underGitLimits<T>(capability: Capability<unknown> | undefined, procedure: ProcedurePath, handler: () => Promise<T>): Promise<T> {
  const { noProgram, noLazyFetch } = gitLimitsOf(capability);
  if (!noProgram && !noLazyFetch) return handler();
  return limits.run({ noProgram, noLazyFetch, procedure, examined: new Map() }, handler);
}

/** This function gives the limits of the current call, or undefined without limits. */
export function currentGitLimits(): GitLimits | undefined {
  return limits.getStore();
}

/** The refusal of a call that cannot start a program. */
function noProgram(procedure: ProcedurePath, message: string): InvocationError {
  return new InvocationError("FORBIDDEN", `${procedure.join(".")}: this call cannot start a program (process), and ${message}`, procedure, "effects-exceeded");
}

/**
 * This function refuses, under a capability without `process`, the URL of a remote that starts a
 * program: the form `<transport>::<address>` starts the remote helper `git-remote-<transport>`.
 */
export function remoteUrlUnderGitLimits(url: string): string {
  const current = currentGitLimits();
  if (current?.noProgram === true && url.includes("::")) {
    throw noProgram(current.procedure, `a remote URL with "::" starts the program of its transport: ${url}`);
  }
  return url;
}

/**
 * This function examines the repository of a working folder for a call that cannot start a
 * program. It refuses a key of the configuration of the repository that starts a program, and a
 * repository with submodules: git starts git in each submodule, with the configuration of the
 * submodule. A folder that is not in a repository passes.
 */
export async function examineForLimits(current: GitLimits, cwd: string, env: Record<string, string | undefined>, hooks: string): Promise<void> {
  // The examination does not fetch, also when the call can
  const examine = (args: string[], input?: string) =>
    runCommand("git", { args: [...noProgramConfig(hooks, "always"), ...args], cwd, env: { ...env, GIT_NO_LAZY_FETCH: "1" }, input });

  // With the files that the configuration includes: each entry has the scope of the file that includes it
  const config = await examine(["config", "--list", "--show-scope", "-z"]);
  // Git did not start, for example because the folder does not exist: the command fails the same way
  if (config.error) return;
  if (!config.success) throw noProgram(current.procedure, `git cannot read the configuration of the repository of ${cwd}: ${config.stderr.trim()}`);
  const keys = refusedConfigKeys(parseConfigList(config.stdout), startsProgram);
  if (keys.length > 0) throw noProgram(current.procedure, `the configuration of the repository of ${cwd} starts one: ${keys.join(", ")}`);

  // A submodule: .gitmodules in the working tree, in the index or at HEAD. Outside a repository, both commands fail
  const top = await examine(["rev-parse", "--show-toplevel"]);
  let modules = top.success && (await exists(join(top.stdout.trim(), ".gitmodules")));
  if (!modules) {
    const objects = await examine(["cat-file", "--batch-check"], ":.gitmodules\nHEAD:.gitmodules\n");
    modules = objects.success && objects.stdout.split(/\r?\n/).some((line) => line !== "" && !line.endsWith(" missing"));
  }
  if (modules) {
    throw noProgram(current.procedure, `the repository of ${cwd} has submodules (.gitmodules): git starts git in each submodule with the configuration of the submodule`);
  }
}

/**
 * This function gives the arguments and the environment of one git command under the limits of
 * its call. Under a root (`confined`), the root already examined the repository.
 */
export async function limitedGitCommand(
  current: GitLimits,
  command: { args: string[]; cwd: string | undefined; env: Record<string, string | undefined> | undefined },
  confined: boolean,
): Promise<{ args: string[]; cwd: string | undefined; env: Record<string, string | undefined> | undefined }> {
  const env = current.noLazyFetch ? { ...command.env, GIT_NO_LAZY_FETCH: "1" } : command.env;
  if (!current.noProgram || confined) return { ...command, env };
  const files = await gitRootSetup();
  const folder = resolve(command.cwd ?? ".");
  let examined = current.examined.get(folder);
  if (examined === undefined) {
    examined = examineForLimits(current, folder, env ?? {}, files.hooks);
    current.examined.set(folder, examined);
  }
  await examined;
  return { args: [...noProgramConfig(files.hooks, "always"), ...command.args], cwd: command.cwd, env };
}
