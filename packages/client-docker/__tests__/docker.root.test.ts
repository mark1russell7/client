/**
 * The docker procedures under the root of a host (roadmap R33). A command that reaches only the
 * daemon runs docker in a working folder of the root. `docker.run`, `docker.exec`,
 * `docker.build` and the compose commands are refused. Docker is not needed: the fake shell of
 * `@procedures/shell/testing`, with the rules of the real one, records what docker would get.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { fakeShell, type FakeShell } from "@procedures/shell/testing";
import { dockerModule } from "../src/module.js";
import type { DockerCommandOutput } from "../src/types.js";

/**
 * The fake shell of each test. The shell.run calls give "ok". The follow stream of docker.logs is
 * the third call of the shell in the test of the nested calls, and it gives "a log line".
 */
let shell: FakeShell;

let base: string;
let root: string;

/** A registry of the docker module and the fake shell, with or without the root. */
function registryOf(withRoot: boolean): ProcedureRegistry {
  const registry = createRegistry(shell.module, dockerModule);
  if (withRoot) confineToRoot(registry, root);
  return registry;
}

async function call<T>(registry: ProcedureRegistry, key: string, input: unknown): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry }));
}

beforeEach(() => {
  shell = fakeShell([{ stdout: "ok" }, { stdout: "ok" }, { stdout: "a log line" }], { fallback: { stdout: "ok" } });
  base = mkdtempSync(join(tmpdir(), "docker-host-root-"));
  root = join(base, "root");
  mkdirSync(join(root, "app"), { recursive: true });
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the docker procedures under the root of a host", () => {
  it("are confined, except run, exec, build and compose", () => {
    const kinds = Object.fromEntries(dockerModule.procedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure).kind]));
    const refused = Object.keys(kinds).filter((key) => kinds[key] === "refused").sort();
    expect(refused).toEqual([
      "docker.build",
      "docker.compose.build",
      "docker.compose.down",
      "docker.compose.logs",
      "docker.compose.ps",
      "docker.compose.restart",
      "docker.compose.up",
      "docker.exec",
      "docker.run",
    ]);
    expect(Object.values(kinds).filter((kind) => kind === "confined")).toHaveLength(16);
  });

  it("run docker in a working folder of the root, through the nested shell.run", async () => {
    const registry = registryOf(true);
    expect(await call<DockerCommandOutput>(registry, "docker.ps", { all: true })).toMatchObject({ success: true, stdout: "ok" });
    expect(shell.calls[0]).toEqual(expect.objectContaining({ command: "docker", cwd: root }));
    expect(shell.args(0)).toContain("ps");
    await call(registry, "docker.images", { cwd: "app" });
    expect(shell.calls[1]?.cwd).toBe(join(root, "app"));
    // The follow stream goes through shell.stream
    const items: unknown[] = [];
    const output = await invokePath(["docker", "logs"], { container: "web", follow: true }, { registry });
    if (output.kind === "stream") for await (const item of output.items) items.push(item);
    expect(items).toEqual([{ type: "stdout", line: "a log line" }, expect.objectContaining({ type: "exit", exitCode: 0 })]);
    expect(shell.streams).toEqual([expect.objectContaining({ command: "docker", cwd: root })]);
  });

  it("refuse a working folder outside the root, and start no docker", async () => {
    const registry = registryOf(true);
    await expect(call(registry, "docker.ps", { cwd: base })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call(registry, "docker.stop", { containers: ["web"], cwd: "../.." })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    expect([...shell.calls, ...shell.streams]).toEqual([]);
  });

  it("refuse run, a compose command and a call of shell.run of a client, and run them without a root", async () => {
    const registry = registryOf(true);
    const input = { image: "alpine", volumes: [`${base}:/host`], command: "cat /host/secret" };
    await expect(call(registry, "docker.run", input)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call(registry, "docker.compose.ps", { cwd: "app" })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call(registry, "shell.run", { command: "docker", args: ["ps"] })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    expect([...shell.calls, ...shell.streams]).toEqual([]);

    const plain = registryOf(false);
    expect(await call<DockerCommandOutput>(plain, "docker.run", input)).toMatchObject({ success: true });
    expect(shell.args(0)).toEqual(expect.arrayContaining(["run", "-v", `${base}:/host`, "alpine"]));
  });
});
