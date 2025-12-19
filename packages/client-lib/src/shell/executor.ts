/**
 * Shell command executor with output capture
 */

import { spawn } from "node:child_process";

export interface ShellResult {
  /** Exit code */
  code: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Combined output in order */
  output: string;
  /** Whether the command succeeded (code === 0) */
  success: boolean;
}

export interface ShellOptions {
  /** Working directory */
  cwd?: string | undefined;
  /** Environment variables */
  env?: Record<string, string> | undefined;
  /** Timeout in milliseconds */
  timeout?: number | undefined;
  /** Whether to use shell (default: true on Windows) */
  shell?: boolean | undefined;
}

/**
 * Execute a shell command and capture output
 */
export function executeCommand(
  command: string,
  args: string[] = [],
  options: ShellOptions = {}
): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const {
      cwd = process.cwd(),
      env = process.env as Record<string, string>,
      timeout,
      shell = process.platform === "win32",
    } = options;

    const proc = spawn(command, args, {
      cwd,
      env,
      shell,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let output = "";

    proc.stdout.on("data", (data: Buffer) => {
      const str = data.toString();
      stdout += str;
      output += str;
    });

    proc.stderr.on("data", (data: Buffer) => {
      const str = data.toString();
      stderr += str;
      output += str;
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeout) {
      timeoutId = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    }

    proc.on("error", (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });

    proc.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        output,
        success: code === 0,
      });
    });
  });
}

/**
 * Execute pnpm install
 */
export async function pnpmInstall(cwd: string): Promise<ShellResult> {
  return executeCommand("pnpm", ["install"], { cwd, timeout: 300000 });
}

/**
 * Execute pnpm run build
 */
export async function pnpmBuild(cwd: string): Promise<ShellResult> {
  return executeCommand("pnpm", ["run", "build"], { cwd, timeout: 120000 });
}

/**
 * Remove a directory recursively
 */
export async function removeDir(path: string): Promise<ShellResult> {
  if (process.platform === "win32") {
    return executeCommand("cmd", ["/c", "rmdir", "/s", "/q", path], {
      timeout: 30000,
    });
  }
  return executeCommand("rm", ["-rf", path], { timeout: 30000 });
}

/**
 * Remove a file
 */
export async function removeFile(path: string): Promise<ShellResult> {
  if (process.platform === "win32") {
    return executeCommand("cmd", ["/c", "del", "/f", "/q", path], {
      timeout: 10000,
    });
  }
  return executeCommand("rm", ["-f", path], { timeout: 10000 });
}
