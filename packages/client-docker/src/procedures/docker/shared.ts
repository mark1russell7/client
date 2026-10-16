/**
 * The way every docker procedure runs docker: an argument list through `shell.run`, no shell.
 *
 * Before, each procedure joined its arguments into one string for `shell.exec`, which runs a
 * shell, so a value such as `x & calc` ran a second command. `docker.*` is an MCP tool, and
 * the deep dive ran an injected command through `docker.ps` and through `client.chain`
 * (documentation/deep-dive-2026-10/wrappers.md, WRP-1).
 */

import type { ProcedureContext } from "@procedures/client";
import type { DockerCommandOutput } from "../../types.js";

/**
 * A value that docker reads as an argument (an image, a container, a path, a service). It must
 * not start with "-", or docker reads it as an option (for example `--privileged`).
 */
export function dockerArg(name: string, value: string): string {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${name} (starts with "-"): ${value}`);
  }
  return value;
}

/** The words of a command string, split at whitespace. No shell runs it, so there is no quoting. */
export function words(command: string): string[] {
  return command.trim().split(/\s+/).filter((word) => word.length > 0);
}

/**
 * The command of docker.run or docker.exec: `args` as they are, or `command` split at whitespace.
 * R32 found that `command` cannot carry an argument with a space, so R41 added `args`. The two
 * together are an error. Docker reads no option after the image or the container, so an
 * argument that starts with "-" goes to the command.
 */
export function commandWords(input: { command?: string | undefined; args?: string[] | undefined }): string[] {
  if (input.command !== undefined && input.args !== undefined) {
    throw new Error("Give command or args, not both");
  }
  return input.args ?? (input.command !== undefined ? words(input.command) : []);
}

/** The start of a compose command: `compose`, the compose file, and the subcommand. */
export function composeArgs(file: string | undefined, subcommand: string): string[] {
  return ["compose", ...(file ? ["-f", file] : []), subcommand];
}

/** The services of a compose command, after its options. */
export function serviceArgs(services: string[] | undefined): string[] {
  return (services ?? []).map((service) => dockerArg("service", service));
}

/** `--label key=value` for each label. */
export function labelArgs(labels: Record<string, string> | undefined): string[] {
  return Object.entries(labels ?? {}).flatMap(([key, value]) => ["--label", `${key}=${value}`]);
}

/** This function runs `docker <args>` and gives its result. It does not throw. */
export async function runDocker(
  args: string[],
  input: { cwd?: string | undefined; timeout?: number | undefined },
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  const startTime = Date.now();
  try {
    const shellInput: { command: string; args: string[]; cwd?: string; timeout?: number } = { command: "docker", args };
    if (input.cwd !== undefined) shellInput.cwd = input.cwd;
    if (input.timeout !== undefined) shellInput.timeout = input.timeout;

    const result = await ctx.client.call<
      typeof shellInput,
      { exitCode: number; stdout: string; stderr: string }
    >(["shell", "run"], shellInput);

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      success: result.exitCode === 0,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      success: false,
      duration: Date.now() - startTime,
    };
  }
}
