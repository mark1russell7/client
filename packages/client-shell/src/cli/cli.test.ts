/**
 * The runner of the CLI wrapper packages (`@procedures/shell/cli`) and the fake shell of their
 * tests (`@procedures/shell/testing`): no program starts.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { fakeShell } from "../testing.js";
import {
  buildArgv,
  cliArg,
  cliToolJsonOutputSchema,
  cliToolOutputSchema,
  CliToolError,
  defineCliTool,
  execPathProgram,
  findInPath,
  nodeScript,
  parseJsonDocument,
  parseJsonOutput,
} from "./index.js";

describe("the argument helpers", () => {
  it("refuse a value that starts with -", () => {
    expect(cliArg("package", "zod")).toBe("zod");
    expect(() => cliArg("package", "--global")).toThrow('Invalid package (starts with "-"): --global');
  });

  it("build the argv: path, flags, named arguments, then -- and the positional arguments", () => {
    expect(buildArgv({ path: ["snapshots"], flags: ["--json"], args: { tag: ["a", "b"], quiet: true, force: false, limit: 3 }, positional: ["-x"] })).toEqual([
      "snapshots",
      "--json",
      "--tag=a",
      "--tag=b",
      "--quiet",
      "--limit=3",
      "--",
      "-x",
    ]);
    expect(() => buildArgv({ path: [], args: { "--evil": true } })).toThrow("not a flag name");
  });

  it("read one JSON document, or NDJSON", () => {
    expect(parseJsonDocument('{"a":1}\n')).toEqual({ a: 1 });
    expect(parseJsonDocument("not json")).toBeUndefined();
    expect(parseJsonDocument("")).toBeUndefined();
    expect(parseJsonOutput('{"a":1}\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe("the output schemas", () => {
  it("name the program and keep the fields that they do not name", () => {
    const value = { exitCode: 0, stdout: "", stderr: "", success: true, duration: 1, signal: "SIGTERM" };
    expect(cliToolOutputSchema("docker").parse(value)).toEqual(value);
    expect(cliToolJsonOutputSchema("npm").parse({ ...value, data: [1] })).toMatchObject({ data: [1] });
  });
});

describe("the program lookup", () => {
  it("runs a script with this Node, and reads npm_execpath and PATH", () => {
    expect(nodeScript("/x/cli.js")).toEqual({ command: process.execPath, prefix: ["/x/cli.js"] });
    const folder = mkdtempSync(join(tmpdir(), "cli-tool-"));
    const script = join(folder, "tool.cjs");
    writeFileSync(script, "");
    const saved = process.env["npm_execpath"];
    try {
      process.env["npm_execpath"] = script;
      expect(execPathProgram({ script: /tool\.cjs$/ })).toEqual(nodeScript(script));
      expect(execPathProgram({ executable: /tool\.cjs$/ })).toEqual({ command: script, prefix: [] });
      expect(execPathProgram({ script: /other\.js$/ })).toBeUndefined();
    } finally {
      if (saved === undefined) delete process.env["npm_execpath"];
      else process.env["npm_execpath"] = saved;
    }
    const path = ["", "/a", folder].join(delimiter);
    expect(findInPath((dir) => (dir === folder ? nodeScript(join(dir, "tool.cjs")) : undefined), path)).toEqual(nodeScript(script));
    expect(findInPath(() => undefined, path)).toBeUndefined();
  });
});

describe("defineCliTool", () => {
  it("runs the program with argv through shell.run, with the options that are set", async () => {
    const shell = fakeShell({ stdout: "out" });
    const tool = defineCliTool({ name: "tool", resolve: () => ({ command: "node", prefix: ["tool.js"] }) });
    const result = await tool.run(["list", "x & calc"], { cwd: "/w", timeout: undefined }, { client: shell.client });
    expect(result).toMatchObject({ exitCode: 0, stdout: "out", stderr: "", success: true });
    expect(typeof result.duration).toBe("number");
    expect(shell.calls).toEqual([{ command: "node", args: ["tool.js", "list", "x & calc"], cwd: "/w" }]);
  });

  it("gives a failed result and does not throw when the program is not found", async () => {
    const shell = fakeShell();
    const tool = defineCliTool({
      name: "tool",
      resolve: () => {
        throw new Error("tool was not found");
      },
    });
    expect(await tool.run(["x"], {}, { client: shell.client })).toMatchObject({ exitCode: 1, success: false, stderr: "tool was not found" });
    expect(shell.calls).toEqual([]);
  });

  it("gives data only for output that the parser reads", async () => {
    const tool = defineCliTool({ name: "tool" });
    expect((await tool.runJson(["x"], {}, { client: fakeShell({ stdout: "[1]" }).client })).data).toEqual([1]);
    expect((await tool.runJson(["x"], {}, { client: fakeShell({ stdout: "text" }).client })).data).toBeUndefined();
  });

  it("throws the error of the tool for a failed command and for output that is not JSON", async () => {
    class ToolError extends Error {
      constructor(message: string, readonly exitCode: number, readonly stderr: string) {
        super(message);
      }
    }
    const tool = defineCliTool({ name: "tool", error: (message, exitCode, stderr) => new ToolError(message, exitCode, stderr) });
    const shell = fakeShell([{ exitCode: 4, stderr: "bad\n" }, { stdout: "not json" }, { stdout: '{"a":1}' }]);
    const ctx = { client: shell.client };
    await expect(tool.output(["pr", "list"], {}, ctx)).rejects.toMatchObject({ message: "tool pr list failed (exit 4): bad", exitCode: 4, stderr: "bad\n" });
    await expect(tool.json(["pr", "view"], {}, ctx)).rejects.toThrow(ToolError);
    expect(await tool.json(["pr", "view"], {}, ctx)).toEqual({ a: 1 });
    await expect(defineCliTool({ name: "x" }).output(["y"], {}, { client: fakeShell({ exitCode: 1 }).client })).rejects.toThrow(CliToolError);
  });
});

describe("fakeShell", () => {
  it("takes the place of the real shell in a registry, with the rules of the real shell.run", async () => {
    const shell = fakeShell([{ stdout: "a\nb\n" }], { fallback: { exitCode: 2 } });
    const registry = createRegistry(shell.module);
    const first = await outputValue(await invokePath(["shell", "run"], { command: "git", args: ["status"] }, { registry }));
    expect(first).toMatchObject({ exitCode: 0, stdout: "a\nb\n", success: true });
    expect(shell.args()).toEqual(["status"]);
    expect(shell.calls[0]).toMatchObject({ command: "git", encoding: "utf8" });
    const second = await outputValue(await invokePath(["shell", "run"], { command: "git" }, { registry }));
    expect(second).toMatchObject({ exitCode: 2, success: false });
    await expect(invokePath(["shell", "run"], { command: "git", encoding: "no-such" }, { registry }).then((output) => outputValue(output))).rejects.toThrow();
    expect(() => shell.args(5)).toThrow("no shell.run call 5");
  });

  it("streams the lines of the result and an exit item, and refuses shell.exec", async () => {
    const shell = fakeShell({ stdout: "one\ntwo\n", stderr: "warn" });
    const items: unknown[] = [];
    for await (const item of shell.client.stream!(["shell", "stream"], { command: "docker", args: ["logs"] })) items.push(item);
    expect(items).toEqual([
      { type: "stdout", line: "one" },
      { type: "stdout", line: "two" },
      { type: "stderr", line: "warn" },
      { type: "exit", exitCode: 0, duration: 1 },
    ]);
    expect(shell.streams).toHaveLength(1);
    const registry = createRegistry(shell.module);
    await expect(invokePath(["shell", "exec"], { command: "echo x" }, { registry }).then((output) => outputValue(output))).rejects.toThrow("fakeShell");
    await expect(shell.client.call(["fs", "read"], {})).rejects.toThrow("fs.read");
  });
});
