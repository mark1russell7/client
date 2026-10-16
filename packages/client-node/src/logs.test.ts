/**
 * node.logs (roadmap R44): the output of a process of node.spawn, through a registry of the
 * module, so the output schema checks each result.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedurePath } from "@procedures/client";
import { processes } from "@procedures/shell/command";
import { nodeModule } from "./module.js";
import { lastLines, splitLines } from "./procedures/node/logs.js";
import type { NodeLogItem, NodeLogsOutput, NodeSpawnOutput } from "./types.js";

const registry = createRegistry(nodeModule);
const dir = mkdtempSync(join(tmpdir(), "client-node-logs-"));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function call<T>(key: string, input: unknown): Promise<T> {
  const path: ProcedurePath = key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

describe("node.logs (R44)", () => {
  it("declares that it only reads the jobs", () => {
    const logs = nodeModule.procedures.find((procedure) => procedure.path.join(".") === "node.logs");
    expect(logs?.metadata.effects).toEqual({ reads: ["jobs"], writes: [] });
  });

  it("gives the output of a running process, its last lines, and the output after its end", async () => {
    const script = join(dir, "talker.cjs");
    writeFileSync(
      script,
      [
        // Only stdout: stdout and stderr are two pipes, and the order between them is not fixed
        "for (let i = 1; i <= 5; i++) console.log('line ' + i);",
        "console.log('\\x1b[31mred line\\x1b[0m');",
        "console.log('ready');",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
    );
    const spawned = await call<NodeSpawnOutput>("node.spawn", { script, ready: { pattern: "ready", timeout: 10_000 } });

    const all = await call<NodeLogsOutput>("node.logs", { processId: spawned.processId });
    expect(all).toMatchObject({ processId: spawned.processId, status: "running" });
    expect(all.output).toContain("line 1");
    expect(all.output).toContain("\x1b[31mred line");

    const tail = await call<NodeLogsOutput>("node.logs", { processId: spawned.processId, lines: 2, stripAnsi: true });
    expect(tail.output.trimEnd().split("\n")).toEqual(["red line", "ready"]);

    await call("node.kill", { processId: spawned.processId });
    const ended = await call<NodeLogsOutput>("node.logs", { processId: spawned.processId, lines: 1 });
    expect(ended.status).toBe("exited");
    expect(ended.output.trim()).toBe("ready");
  }, 20_000);

  it("fails for a process that node.spawn did not start, and validates its input", async () => {
    await expect(call("node.logs", { processId: "node-nope-1" })).rejects.toThrow(/no process node-nope-1/);
    await expect(call("node.logs", { processId: "x", lines: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("gives an exit code and the output of stderr after the end of a process", async () => {
    const script = join(dir, "fails.cjs");
    writeFileSync(script, "console.log('bye'); console.error('to stderr'); process.exitCode = 3;");
    const spawned = await call<NodeSpawnOutput>("node.spawn", { script });
    const end = Date.now() + 10_000;
    let logs = await call<NodeLogsOutput>("node.logs", { processId: spawned.processId });
    while (logs.status === "running" && Date.now() < end) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      logs = await call<NodeLogsOutput>("node.logs", { processId: spawned.processId });
    }
    expect(logs).toMatchObject({ status: "exited", exitCode: 3 });
    expect(logs.output).toContain("bye");
    expect(logs.output).toContain("to stderr");
  }, 20_000);
});

describe("lastLines", () => {
  it("keeps the last lines and the final line end", () => {
    expect(lastLines("a\nb\nc\n", 2)).toBe("b\nc\n");
    expect(lastLines("a\nb\nc", 2)).toBe("b\nc");
    expect(lastLines("a\nb\n", 5)).toBe("a\nb\n");
    expect(lastLines("", 1)).toBe("");
  });

  it("splitLines removes the line ends, and a final line end adds no line", () => {
    expect(splitLines("a\r\nb\nc\n")).toEqual(["a", "b", "c"]);
    expect(splitLines("a\n\nb")).toEqual(["a", "", "b"]);
    expect(splitLines("")).toEqual([]);
  });
});

async function stream(input: unknown, signal?: AbortSignal): Promise<AsyncGenerator<NodeLogItem, void, undefined>> {
  const output = await invokePath<NodeLogItem>(["node", "logs"], input, { registry, ...(signal ? { signal } : {}) });
  if (output.kind !== "stream") throw new Error("node.logs with follow gave a value, not a stream");
  return output.items;
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

/** The number of subscribers of a process in the process registry of client-shell. */
function subscribers(processId: string): number {
  return (processes as unknown as { entries: Map<string, { listeners: Set<unknown> }> }).entries.get(processId)?.listeners.size ?? 0;
}

describe("node.logs with follow", () => {
  it("gives the kept lines, the new lines of stdout and stderr, and the exit", async () => {
    const script = join(dir, "follow.cjs");
    const go = join(dir, "follow.go");
    writeFileSync(
      script,
      [
        "const { existsSync } = require('node:fs');",
        "for (let i = 1; i <= 3; i++) console.log('line ' + i);",
        "console.log('ready');",
        // The late output waits for the file of the test: the follow started before it
        "const wait = setInterval(() => {",
        "  if (!existsSync(process.argv[2])) return;",
        "  clearInterval(wait);",
        "  console.log('\\x1b[32mlate out\\x1b[0m');",
        "  console.error('late err');",
        "  setTimeout(() => { process.stdout.write('no line end'); process.exitCode = 2; }, 100);",
        "}, 10);",
      ].join("\n"),
    );
    const spawned = await call<NodeSpawnOutput>("node.spawn", { script, args: [go], ready: { pattern: "ready", timeout: 10_000 } });
    const followed = await stream({ processId: spawned.processId, follow: true, lines: 2, stripAnsi: true });
    const first = [(await followed.next()).value, (await followed.next()).value];
    writeFileSync(go, "go");
    const items = [...first, ...(await collect(followed))] as NodeLogItem[];

    expect(items.slice(0, 2)).toEqual([
      { type: "output", line: "line 3" },
      { type: "output", line: "ready" },
    ]);
    // stdout and stderr are two pipes: the order between them is not fixed
    expect(items.filter((item) => item.type === "stdout")).toEqual([
      { type: "stdout", line: "late out" },
      { type: "stdout", line: "no line end" },
    ]);
    expect(items.filter((item) => item.type === "stderr")).toEqual([{ type: "stderr", line: "late err" }]);
    expect(items.at(-1)).toEqual({ type: "exit", status: "exited", exitCode: 2 });
    expect(subscribers(spawned.processId)).toBe(0);

    // A follow of an ended process gives the kept lines and the exit at once
    const again = await collect(await stream({ processId: spawned.processId, follow: true, lines: 1 }));
    expect(again).toEqual([{ type: "output", line: "no line end" }, { type: "exit", status: "exited", exitCode: 2 }]);
  }, 20_000);

  it("ends at an abort of the caller and when the reader stops, and leaves no subscriber", async () => {
    const script = join(dir, "ticker.cjs");
    writeFileSync(script, "let n = 0; console.log('ready'); setInterval(() => console.log('tick ' + ++n), 10);");
    const spawned = await call<NodeSpawnOutput>("node.spawn", { script, ready: { pattern: "ready", timeout: 10_000 } });
    try {
      const controller = new AbortController();
      const items = await stream({ processId: spawned.processId, follow: true }, controller.signal);
      expect((await items.next()).value).toEqual({ type: "output", line: "ready" });
      expect((await items.next()).value).toMatchObject({ type: "stdout", line: expect.stringMatching(/^tick \d+$/) });
      expect(subscribers(spawned.processId)).toBe(1);
      controller.abort();
      // The stream ends: quietly, or with ABORTED from the invocation
      await collect(items).catch((error: unknown) => expect(error).toMatchObject({ code: "ABORTED" }));
      expect(subscribers(spawned.processId)).toBe(0);

      let read = 0;
      for await (const item of await stream({ processId: spawned.processId, follow: true, lines: 1 })) {
        expect(item.type === "output" || item.type === "stdout").toBe(true);
        if (++read === 4) break;
      }
      expect(subscribers(spawned.processId)).toBe(0);
      expect((await call<NodeLogsOutput>("node.logs", { processId: spawned.processId })).status).toBe("running");
    } finally {
      await call("node.kill", { processId: spawned.processId });
    }
  }, 20_000);

  it("fails the call itself for a process that node.spawn did not start", async () => {
    await expect(stream({ processId: "node-nope-2", follow: true })).rejects.toThrow(/no process node-nope-2/);
  });

  it("declares an unbounded stream and the short -f", () => {
    const logs = nodeModule.procedures.find((procedure) => procedure.path.join(".") === "node.logs");
    expect(logs?.metadata.stream).toEqual({ unbounded: true });
    expect(logs?.metadata["shorts"]).toEqual({ lines: "n", follow: "f" });
  });
});
