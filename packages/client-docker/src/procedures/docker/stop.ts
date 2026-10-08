/**
 * docker.stop procedure
 *
 * Stop running container(s).
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerStopInput, DockerCommandOutput } from "../../types.js";

/**
 * Stop container(s)
 */
export async function dockerStop(
  input: DockerStopInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  const startTime = Date.now();

  try {
    const args: string[] = ["stop"];

    if (input.time !== undefined) {
      args.push("-t", String(input.time));
    }

    args.push(...input.containers);

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
