/**
 * docker.logs procedure
 *
 * Get container logs. With `follow`, the procedure is a stream: each log line is an item while
 * the container runs. The stream ends when the reader stops or the signal aborts, and that ends
 * `docker logs -f`. Before, `follow` waited for docker to end, so the call gave nothing until a
 * timeout or a cancel.
 */

import type { ProcedureContext } from "@procedures/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerLogsInput, DockerCommandOutput, DockerLogItem } from "../../types.js";

// The type lives in types.ts, next to its output schema
export type { DockerLogItem };

/**
 * Get container logs: one value, or with `follow` a stream of lines
 */
export async function dockerLogs(
  input: DockerLogsInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput | AsyncGenerator<DockerLogItem, void, undefined>> {
  const args: string[] = ["logs"];

  if (input.follow) args.push("-f");
  if (input.tail !== undefined) args.push("--tail", String(input.tail));
  if (input.timestamps) args.push("-t");

  // The guard runs before anything starts, also for a stream
  args.push(dockerArg("container", input.container));

  if (input.follow) {
    return followLogs(args, input, ctx);
  }
  return runDocker(args, input, ctx);
}

/** The lines of `docker <args>` through shell.stream, which runs no shell and ends the program when the reader stops. */
async function* followLogs(
  args: string[],
  input: DockerLogsInput,
  ctx: ProcedureContext
): AsyncGenerator<DockerLogItem, void, undefined> {
  const shellInput: { command: string; args: string[]; cwd?: string; timeout?: number } = { command: "docker", args };
  if (input.cwd !== undefined) shellInput.cwd = input.cwd;
  if (input.timeout !== undefined) shellInput.timeout = input.timeout;
  if (!ctx.client.stream) {
    throw new Error("docker.logs with follow needs a host whose client can stream");
  }
  yield* ctx.client.stream<typeof shellInput, DockerLogItem>(["shell", "stream"], shellInput);
}
