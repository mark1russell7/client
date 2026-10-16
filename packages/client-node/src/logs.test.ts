/**
 * node.logs (roadmap R44): the output of a process of node.spawn, through a registry of the
 * module, so the output schema checks each result.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedurePath } from "@procedures/client";
import { nodeModule } from "./module.js";
import { lastLines } from "./procedures/node/logs.js";
import type { NodeLogsOutput, NodeSpawnOutput } from "./types.js";

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
});
