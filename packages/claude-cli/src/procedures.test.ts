import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputItems, outputValue } from "@procedures/client";
import { claudeCliProcedures } from "./module.js";
import { claudeStart } from "./procedures/claude/index.js";
import type { SpawnedProcess, Spawner } from "./turn.js";
import type { ClaudeReadOutput, ClaudeStartOutput } from "./types.js";

const line = (value: unknown): string => `${JSON.stringify(value)}\n`;
const FILE_TEXT =
  line({ type: "system", subtype: "init", session_id: "00000000-0000-4000-8000-000000000003" }) +
  line({ type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } }) +
  line({ type: "result", subtype: "success", is_error: false, result: "Hello" });

const registry = new ProcedureRegistry();
for (const procedure of claudeCliProcedures) registry.register(procedure);
const call = <T>(path: string[], input: unknown): Promise<T> => invokePath<T>(path, input, { registry }).then((output) => outputValue(output, path));

function outputFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), "claude-cli-procedures-")), "turn.ndjson");
  writeFileSync(file, FILE_TEXT);
  return file;
}

describe("the procedures of claude-cli", () => {
  it("declares the effects of each procedure", () => {
    const effects = Object.fromEntries(claudeCliProcedures.map((procedure) => [procedure.path.join("."), procedure.metadata?.effects]));
    expect(effects).toEqual({
      "claude.start": { reads: ["fs", "network", "process"], writes: ["fs", "network", "process", "jobs"] },
      "claude.read": { reads: ["fs", "jobs"], writes: [] },
      "claude.follow": { reads: ["fs", "jobs"], writes: [] },
      "claude.cancel": { reads: ["jobs"], writes: ["jobs"], destructive: true, idempotent: true },
    });
  });

  it("claude.read gives the events and the next offset", async () => {
    const result = await call<ClaudeReadOutput>(["claude", "read"], { outputFile: outputFile() });
    expect(result.events.map((item) => item.event.type)).toEqual(["meta", "text", "result"]);
    expect(result.events[1]!.event).toEqual({ type: "text", text: "Hello" });
    expect(result.finished).toBe(true);
    expect(result.offset).toBe(Buffer.byteLength(FILE_TEXT));
  });

  it("claude.follow streams the events up to the result", async () => {
    const output = await invokePath(["claude", "follow"], { outputFile: outputFile(), pollMs: 10 }, { registry });
    const types: string[] = [];
    for await (const item of outputItems(output)) types.push((item as { event: { type: string } }).event.type);
    expect(types).toEqual(["meta", "text", "result"]);
  });

  it("claude.cancel refuses a low process id, and reports a process that does not run", async () => {
    await expect(call(["claude", "cancel"], { pid: 1 })).rejects.toThrow();
    expect(await call(["claude", "cancel"], { pid: 99_999_999 })).toEqual({ stopped: false, reason: "The process has ended" });
  });

  it("claude.start refuses an empty prompt", async () => {
    await expect(call(["claude", "start"], { prompt: "" })).rejects.toThrow();
  });

  it("claude.start adds the variables of env to the environment of the host", async () => {
    let env: NodeJS.ProcessEnv | undefined;
    const spawner: Spawner = (_command, _args, options) => {
      env = options.env;
      const child = new EventEmitter() as EventEmitter & SpawnedProcess;
      Object.assign(child, { pid: 4321, unref: () => undefined });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    };
    const turn: ClaudeStartOutput = await claudeStart({ prompt: "x", executable: "/opt/claude", env: { EXAMPLE_FLAG: "1" } }, spawner);
    expect(turn.pid).toBe(4321);
    expect(env).toMatchObject({ EXAMPLE_FLAG: "1" });
    expect(Object.keys(env ?? {}).length).toBe(Object.keys(process.env).length + 1);
  });
});
