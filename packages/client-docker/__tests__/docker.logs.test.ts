/**
 * docker.logs with `follow` is a stream: each log line is an item while the container runs,
 * and the stream ends when the reader stops (deep dive WRP-4 follow-up). Before, `follow`
 * waited for docker to end, so the call ran until a timeout or a cancel, and gave nothing.
 */

import { describe, it, expect, vi } from "vitest";
import type { ProcedureContext } from "@mark1russell7/client";
import { dockerLogs, type DockerLogItem } from "../src/procedures/docker/logs.js";

const isAsyncIterable = (value: unknown): boolean =>
  typeof value === "object" && value !== null && Symbol.asyncIterator in value;

/** A context whose shell.stream yields `lines`, then waits for the reader to stop. */
function streamingContext(lines: string[]) {
  const state = { ended: false, input: undefined as undefined | { command: string; args: string[] } };
  const stream = vi.fn((path: string[], input: { command: string; args: string[] }) => {
    expect(path).toEqual(["shell", "stream"]);
    state.input = input;
    return (async function* () {
      try {
        for (const line of lines) yield { type: "stdout", line };
        // docker logs -f does not end by itself
        await new Promise(() => {});
      } finally {
        state.ended = true;
      }
    })();
  });
  const call = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "all\n", stderr: "" });
  return { ctx: { client: { call, stream } } as unknown as ProcedureContext, state, call, stream };
}

describe("docker.logs", () => {
  it("follows: each line is an item, and the command ends when the reader stops", async () => {
    const { ctx, state } = streamingContext(["one", "two", "three"]);
    const result = await dockerLogs({ container: "web", follow: true, tail: 5 }, ctx);
    expect(isAsyncIterable(result)).toBe(true);

    const lines: string[] = [];
    for await (const item of result as AsyncIterable<DockerLogItem>) {
      if (item.type === "stdout") lines.push(item.line);
      if (lines.length === 2) break;
    }

    expect(lines).toEqual(["one", "two"]);
    expect(state.input).toEqual({ command: "docker", args: ["logs", "-f", "--tail", "5", "web"] });
    expect(state.ended).toBe(true);
  });

  it("refuses a container name that docker reads as an option, before it starts", async () => {
    const { ctx, stream } = streamingContext([]);
    await expect(dockerLogs({ container: "--privileged", follow: true }, ctx)).rejects.toThrow("starts with");
    expect(stream).not.toHaveBeenCalled();
  });

  it("without follow, gives one value", async () => {
    const { ctx, call, stream } = streamingContext([]);
    const result = await dockerLogs({ container: "web" }, ctx);
    expect(result).toMatchObject({ success: true, stdout: "all\n" });
    expect(call).toHaveBeenCalledOnce();
    expect(stream).not.toHaveBeenCalled();
  });
});
