/**
 * docker.logs procedure
 *
 * Get container logs.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerLogsInput, DockerCommandOutput } from "../../types.js";

/**
 * Get container logs
 */
export async function dockerLogs(
  input: DockerLogsInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  const startTime = Date.now();

  try {
    const args: string[] = ["logs"];

    if (input.follow) args.push("-f");
    if (input.tail !== undefined) args.push("--tail", String(input.tail));
    if (input.timestamps) args.push("-t");

    args.push(input.container);

    const command = ["docker", ...args].join(" ");

    const shellInput: {
      command: string;
      cwd?: string | undefined;
      timeout?: number | undefined;
    } = { command };

    if (input.cwd !== undefined) shellInput.cwd = input.cwd;
    if (input.timeout !== undefined) shellInput.timeout = input.timeout;

    const result = await ctx.client.call<
      typeof shellInput,
      { exitCode: number; stdout: string; stderr: string }
    >(["shell", "exec"], shellInput);

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
