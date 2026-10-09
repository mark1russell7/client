/**
 * shell.exec procedure
 *
 * Execute a command string via shell.
 *
 * This is the one procedure that runs a shell: the command is a shell command line. It is not an
 * MCP tool, and a data-driven procedure cannot call it (BUGS-2026-07 H18). The shell runs through
 * the command helpers, so the timeout and `ctx.signal` kill the shell and every program that it
 * started (deep dive WRP-10), and the `stdin` input reaches the command.
 */

import { runCommand } from "../../command/run.js";
import type { ShellExecInput, ShellExecOutput } from "../../types.js";

/** The program and the arguments that run `command` in a shell, as Node's `exec` does. */
export function shellCommandLine(
  command: string,
  shell: boolean | string,
): { file: string; args: string[]; verbatim: boolean } {
  if (process.platform === "win32") {
    const file = typeof shell === "string" ? shell : process.env["ComSpec"] ?? "cmd.exe";
    if (/(?:^|[\\/])cmd(?:\.exe)?$/i.test(file)) {
      // cmd.exe reads the rest of its command line as it is, so the arguments get no quotes
      return { file, args: ["/d", "/s", "/c", `"${command}"`], verbatim: true };
    }
    return { file, args: ["-c", command], verbatim: false };
  }
  return { file: typeof shell === "string" ? shell : "/bin/sh", args: ["-c", command], verbatim: false };
}

export async function shellExec(
  input: ShellExecInput,
  ctx?: { signal?: AbortSignal | undefined }
): Promise<ShellExecOutput> {
  const { file, args, verbatim } = shellCommandLine(input.command, input.shell);
  const result = await runCommand(file, {
    args,
    windowsVerbatimArguments: verbatim,
    cwd: input.cwd,
    env: input.env,
    timeout: input.timeout,
    signal: ctx?.signal,
    input: input.stdin,
    maxOutputBytes: input.maxBuffer,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    success: result.success,
    duration: result.duration,
    signal: result.signal,
  };
}
