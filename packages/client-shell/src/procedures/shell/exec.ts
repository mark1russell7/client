/**
 * shell.exec procedure
 *
 * Execute a command string via shell.
 */

import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import type { ShellExecInput, ShellExecOutput } from "../../types.js";

const execAsync = promisify(execCb);

export async function shellExec(input: ShellExecInput): Promise<ShellExecOutput> {
  const startTime = Date.now();

  try {
    // Convert shell option: true = undefined (use default), string = use that shell
    const shellOpt = typeof input.shell === "string" ? input.shell : undefined;

    const { stdout, stderr } = await execAsync(input.command, {
      cwd: input.cwd,
      env: input.env ? { ...process.env, ...input.env } : process.env,
      timeout: input.timeout,
      shell: shellOpt,
      maxBuffer: input.maxBuffer,
    });

    return {
      exitCode: 0,
      stdout,
      stderr,
      success: true,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const err = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
      signal?: string;
    };

    return {
      exitCode: err.code ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message,
      success: false,
      duration: Date.now() - startTime,
      signal: err.signal,
    };
  }
}
