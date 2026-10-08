/**
 * docker.compose.down procedure
 *
 * Stop services with docker compose.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerComposeDownInput, DockerCommandOutput } from "../../types.js";

/**
 * Stop services with docker compose
 */
export async function dockerComposeDown(
  input: DockerComposeDownInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  const startTime = Date.now();

  try {
    const args: string[] = ["compose"];

    if (input.file) args.push("-f", input.file);

    args.push("down");

    if (input.volumes) args.push("-v");
    if (input.removeOrphans) args.push("--remove-orphans");
    if (input.rmi) args.push("--rmi", input.rmi);

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
