/**
 * The docker procedures under the root of a host (roadmap R33). A command that reaches only the
 * daemon runs docker in a working folder of the root. `docker.run`, `docker.exec`,
 * `docker.build` and the compose commands are refused. Docker is not needed: a fake `shell.run`
 * and a fake `shell.stream`, with the rules of the real ones, record what docker would get.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, defineModule, invokePath, outputValue, type AnyProcedure, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { shellModule } from "@procedures/shell/module";
import { dockerModule } from "../src/module.js";
import type { DockerCommandOutput } from "../src/types.js";

/** The input of a shell procedure. */
type ShellInput = { command: string; args: string[]; cwd?: string };

/** The inputs of the fake shell procedures. */
let runs: Array<{ key: string; input: ShellInput }>;

/** The shell procedures with their metadata and rules, and handlers that record their input. */
function fakeShell(): AnyProcedure[] {
  return shellModule.procedures.map((procedure): AnyProcedure => {
    const key = procedure.path.join(".");
    if (key === "shell.run") {
      return {
        ...procedure,
        handler: (input: ShellInput) => {
          runs.push({ key, input });
          return { exitCode: 0, stdout: "ok", stderr: "", success: true, duration: 1 };
        },
      };
    }
    if (key === "shell.stream") {
      return {
        ...procedure,
        handler: async function* (input: ShellInput) {
          runs.push({ key, input });
          yield { type: "stdout", line: "a log line" };
        },
      };
    }
    return procedure;
  });
}

let base: string;
let root: string;

/** A registry of the docker module and the fake shell, with or without the root. */
function registryOf(withRoot: boolean): ProcedureRegistry {
  const registry = createRegistry(defineModule("@procedures/shell", fakeShell()), dockerModule);
  if (withRoot) confineToRoot(registry, root);
  return registry;
}

async function call<T>(registry: ProcedureRegistry, key: string, input: unknown): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry }));
}

beforeEach(() => {
  runs = [];
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
    expect(runs[0]).toEqual({ key: "shell.run", input: expect.objectContaining({ command: "docker", cwd: root }) });
    expect(runs[0]?.input.args).toContain("ps");
    await call(registry, "docker.images", { cwd: "app" });
    expect(runs[1]?.input.cwd).toBe(join(root, "app"));
    // The follow stream goes through shell.stream
    const items: unknown[] = [];
    const output = await invokePath(["docker", "logs"], { container: "web", follow: true }, { registry });
    if (output.kind === "stream") for await (const item of output.items) items.push(item);
    expect(items).toEqual([{ type: "stdout", line: "a log line" }]);
    expect(runs[2]).toEqual({ key: "shell.stream", input: expect.objectContaining({ command: "docker", cwd: root }) });
  });

  it("refuse a working folder outside the root, and start no docker", async () => {
    const registry = registryOf(true);
    await expect(call(registry, "docker.ps", { cwd: base })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call(registry, "docker.stop", { containers: ["web"], cwd: "../.." })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    expect(runs).toEqual([]);
  });

  it("refuse run, a compose command and a call of shell.run of a client, and run them without a root", async () => {
    const registry = registryOf(true);
    const input = { image: "alpine", volumes: [`${base}:/host`], command: "cat /host/secret" };
    await expect(call(registry, "docker.run", input)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call(registry, "docker.compose.ps", { cwd: "app" })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call(registry, "shell.run", { command: "docker", args: ["ps"] })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    expect(runs).toEqual([]);

    const plain = registryOf(false);
    expect(await call<DockerCommandOutput>(plain, "docker.run", input)).toMatchObject({ success: true });
    expect(runs[0]?.input.args).toEqual(expect.arrayContaining(["run", "-v", `${base}:/host`, "alpine"]));
  });
});
