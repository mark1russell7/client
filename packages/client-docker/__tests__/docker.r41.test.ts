/**
 * The docker procedures of roadmap R41, through a registry of the module with a fake shell: the
 * argument list of each procedure, the guards, the `args` alternative of docker.run and
 * docker.exec, the confirmation of docker.prune and the declared effects. No docker runs.
 */

import { describe, it, expect, vi } from "vitest";
import { createRegistry, invokePath, outputValue, type Effects, type ProcedureContext, type ProcedurePath } from "@procedures/client";
import { fakeShell as sharedFakeShell } from "@procedures/shell/testing";
import dockerModule, { registerDockerProcedures } from "../src/module.js";
import { dockerExec } from "../src/procedures/docker/exec.js";
import { dockerPrune } from "../src/procedures/docker/prune.js";
import type { DockerCommandOutput, DockerInspectOutput } from "../src/types.js";

/** The client of a procedure context: the fake shell takes its place. */
type ProcedureClient = ProcedureContext["client"];

const registry = createRegistry(dockerModule);

/** A fake shell: shell.run gives `result` and records each input. */
function fakeShell(result: { exitCode: number; stdout?: string; stderr?: string } = { exitCode: 0 }) {
  const shell = sharedFakeShell(result);
  const client: ProcedureClient = shell.client;
  /** The argument list of docker in the first shell.run call. */
  const args = (): string[] => {
    expect(shell.calls[0]?.command).toBe("docker");
    return shell.args();
  };
  return { calls: shell.calls, client, args };
}

/** This function calls a docker procedure through the registry, with the fake shell as ctx.client. */
async function docker<T = DockerCommandOutput>(operation: string, input: unknown, client: ProcedureClient): Promise<T> {
  const path: ProcedurePath = ["docker", ...operation.split(".")];
  return outputValue(await invokePath<T>(path, input, { registry, client }), path);
}

describe("docker.compose.ps, logs, build and restart", () => {
  it("put the compose file before the subcommand, and the services last", async () => {
    let shell = fakeShell({ exitCode: 0, stdout: "NAME  STATUS\n" });
    const ps = await docker("compose.ps", { file: "compose.test.yml", all: true, format: "json", services: ["db"] }, shell.client);
    expect(shell.args()).toEqual(["compose", "-f", "compose.test.yml", "ps", "--all", "--format", "json", "db"]);
    expect(ps).toMatchObject({ success: true, stdout: "NAME  STATUS\n" });

    shell = fakeShell();
    await docker("compose.logs", { services: ["api", "db"], tail: 50, since: "10m", timestamps: true }, shell.client);
    expect(shell.args()).toEqual(["compose", "logs", "--no-color", "--tail", "50", "--since", "10m", "--timestamps", "api", "db"]);

    shell = fakeShell();
    await docker("compose.build", { file: "c.yml", noCache: true, pull: true, buildArgs: { VERSION: "1 2" }, services: ["api"] }, shell.client);
    expect(shell.args()).toEqual(["compose", "-f", "c.yml", "build", "--no-cache", "--pull", "--build-arg", "VERSION=1 2", "api"]);

    shell = fakeShell();
    await docker("compose.restart", { time: 5 }, shell.client);
    expect(shell.args()).toEqual(["compose", "restart", "--timeout", "5"]);
  });

  it("refuse a service that starts with -", async () => {
    const shell = fakeShell();
    await expect(docker("compose.restart", { services: ["--no-deps"] }, shell.client)).rejects.toThrow("starts with");
    expect(shell.calls).toEqual([]);
  });
});

describe("docker.images and docker.inspect", () => {
  it("images passes the options and the repository", async () => {
    const shell = fakeShell();
    await docker("images", { all: true, filter: "dangling=true", format: "{{.ID}}", repository: "nginx" }, shell.client);
    expect(shell.args()).toEqual(["images", "--all", "--filter", "dangling=true", "--format", "{{.ID}}", "nginx"]);
    await expect(docker("images", { repository: "--quiet" }, fakeShell().client)).rejects.toThrow("starts with");
  });

  it("inspect gives the JSON of docker as data", async () => {
    const objects = [{ Id: "abc", Name: "/web" }];
    const shell = fakeShell({ exitCode: 0, stdout: `${JSON.stringify(objects)}\n` });
    const result = await docker<DockerInspectOutput>("inspect", { targets: ["web"], type: "container" }, shell.client);
    expect(shell.args()).toEqual(["inspect", "--type", "container", "web"]);
    expect(result.data).toEqual(objects);
  });

  it("inspect keeps the found objects for a missing target, and gives no data with a format", async () => {
    let shell = fakeShell({ exitCode: 1, stdout: '[{"Id":"abc"}]', stderr: "Error: No such object: nope" });
    const partial = await docker<DockerInspectOutput>("inspect", { targets: ["web", "nope"] }, shell.client);
    expect(partial).toMatchObject({ success: false, data: [{ Id: "abc" }] });

    shell = fakeShell({ exitCode: 0, stdout: "running\n" });
    const formatted = await docker<DockerInspectOutput>("inspect", { targets: ["web"], format: "{{.State.Status}}" }, shell.client);
    expect(shell.args()).toEqual(["inspect", "--format", "{{.State.Status}}", "web"]);
    expect(formatted.data).toBeUndefined();

    shell = fakeShell({ exitCode: 0, stdout: "[not json" });
    expect((await docker<DockerInspectOutput>("inspect", { targets: ["web"] }, shell.client)).data).toBeUndefined();
    await expect(docker("inspect", { targets: [] }, fakeShell().client)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("docker.volume.* and docker.network.*", () => {
  it("list, create and remove volumes", async () => {
    let shell = fakeShell();
    await docker("volume.list", { filter: "label=app", format: "{{.Name}}" }, shell.client);
    expect(shell.args()).toEqual(["volume", "ls", "--filter", "label=app", "--format", "{{.Name}}"]);

    shell = fakeShell({ exitCode: 0, stdout: "data\n" });
    await docker("volume.create", { name: "data", driver: "local", labels: { app: "web" } }, shell.client);
    expect(shell.args()).toEqual(["volume", "create", "--driver", "local", "--label", "app=web", "data"]);

    shell = fakeShell();
    await docker("volume.create", {}, shell.client);
    expect(shell.args()).toEqual(["volume", "create"]);

    shell = fakeShell();
    await docker("volume.remove", { volumes: ["data", "cache"], force: true }, shell.client);
    expect(shell.args()).toEqual(["volume", "rm", "--force", "data", "cache"]);
    await expect(docker("volume.remove", { volumes: ["-a"] }, fakeShell().client)).rejects.toThrow("starts with");
  });

  it("list, create and remove networks", async () => {
    let shell = fakeShell();
    await docker("network.list", {}, shell.client);
    expect(shell.args()).toEqual(["network", "ls"]);

    shell = fakeShell();
    await docker("network.list", { filter: "driver=bridge", format: "{{.Name}}" }, shell.client);
    expect(shell.args()).toEqual(["network", "ls", "--filter", "driver=bridge", "--format", "{{.Name}}"]);

    shell = fakeShell();
    await docker("network.create", { name: "backend", driver: "bridge", internal: true, labels: { team: "a" } }, shell.client);
    expect(shell.args()).toEqual(["network", "create", "--driver", "bridge", "--internal", "--label", "team=a", "backend"]);

    shell = fakeShell();
    await docker("network.remove", { networks: ["backend"] }, shell.client);
    expect(shell.args()).toEqual(["network", "rm", "backend"]);
    await expect(docker("network.create", { name: "--attachable" }, fakeShell().client)).rejects.toThrow("starts with");
  });
});

describe("docker.tag and docker.push", () => {
  it("tag passes the source and the target", async () => {
    const shell = fakeShell();
    await docker("tag", { source: "app:latest", target: "registry.example.com/app:1.0" }, shell.client);
    expect(shell.args()).toEqual(["tag", "app:latest", "registry.example.com/app:1.0"]);
    await expect(docker("tag", { source: "app", target: "-x" }, fakeShell().client)).rejects.toThrow("starts with");
  });

  it("push passes all-tags and the image, and gives the failure of docker", async () => {
    const shell = fakeShell({ exitCode: 1, stderr: "denied: requested access to the resource is denied" });
    const result = await docker("push", { image: "registry.example.com/app", allTags: true }, shell.client);
    expect(shell.args()).toEqual(["push", "--all-tags", "registry.example.com/app"]);
    expect(result).toMatchObject({ success: false, exitCode: 1, stderr: expect.stringContaining("denied") });
  });
});

describe("docker.prune", () => {
  it("needs confirm: true", async () => {
    const shell = fakeShell();
    await expect(docker("prune", {}, shell.client)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(docker("prune", { confirm: false }, shell.client)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(docker("prune", { confirm: "yes" }, shell.client)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    // A direct call of the function gets the same check
    await expect(dockerPrune({} as never, { client: shell.client } as never)).rejects.toThrow(/confirm: true/);
    expect(shell.calls).toEqual([]);
  });

  it("prunes the system by default, with --force, and the other kinds", async () => {
    let shell = fakeShell({ exitCode: 0, stdout: "Total reclaimed space: 0B\n" });
    await docker("prune", { confirm: true }, shell.client);
    expect(shell.args()).toEqual(["system", "prune", "--force"]);

    shell = fakeShell();
    await docker("prune", { confirm: true, all: true, volumes: true, filter: "until=24h" }, shell.client);
    expect(shell.args()).toEqual(["system", "prune", "--force", "--all", "--volumes", "--filter", "until=24h"]);

    shell = fakeShell();
    await docker("prune", { confirm: true, kind: "image", all: true }, shell.client);
    expect(shell.args()).toEqual(["image", "prune", "--force", "--all"]);
  });

  it("refuses volumes with a kind other than system, and an unknown kind", async () => {
    await expect(docker("prune", { confirm: true, kind: "volume", volumes: true }, fakeShell().client)).rejects.toThrow(/kind system/);
    await expect(docker("prune", { confirm: true, kind: "everything" }, fakeShell().client)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("the args of docker.run and docker.exec (R32: command cannot carry quoted text)", () => {
  it("run passes each item of args as one argument", async () => {
    const shell = fakeShell();
    await docker("run", { image: "alpine", rm: true, args: ["sh", "-c", "echo 'hello world' > /tmp/x"] }, shell.client);
    expect(shell.args()).toEqual(["run", "--rm", "alpine", "sh", "-c", "echo 'hello world' > /tmp/x"]);
  });

  it("exec passes each item of args as one argument, and command still works", async () => {
    let shell = fakeShell();
    await docker("exec", { container: "web", args: ["printf", "%s\\n", "a b"] }, shell.client);
    expect(shell.args()).toEqual(["exec", "web", "printf", "%s\\n", "a b"]);

    shell = fakeShell();
    await docker("exec", { container: "web", command: "ls  -la /" }, shell.client);
    expect(shell.args()).toEqual(["exec", "web", "ls", "-la", "/"]);
  });

  it("refuse command and args together, and exec without a command", async () => {
    await expect(docker("run", { image: "alpine", command: "echo", args: ["echo"] }, fakeShell().client)).rejects.toThrow(/not both/);
    await expect(docker("exec", { container: "web", command: "ls", args: ["ls"] }, fakeShell().client)).rejects.toThrow(/not both/);
    await expect(docker("exec", { container: "web" }, fakeShell().client)).rejects.toThrow(/needs command or args/);
    await expect(dockerExec({ container: "web", command: "  " }, { client: fakeShell().client } as never)).rejects.toThrow(/needs command or args/);
  });
});

describe("each procedure with the smallest input", () => {
  const CASES: Array<[operation: string, input: Record<string, unknown>, args: string[]]> = [
    ["compose.ps", {}, ["compose", "ps"]],
    ["compose.logs", {}, ["compose", "logs", "--no-color"]],
    ["compose.build", {}, ["compose", "build"]],
    ["compose.restart", { file: "c.yml", services: ["api"] }, ["compose", "-f", "c.yml", "restart", "api"]],
    ["images", {}, ["images"]],
    ["inspect", { targets: ["a", "b"] }, ["inspect", "a", "b"]],
    ["volume.list", {}, ["volume", "ls"]],
    ["volume.remove", { volumes: ["data"] }, ["volume", "rm", "data"]],
    ["network.create", { name: "net" }, ["network", "create", "net"]],
    ["push", { image: "app:1" }, ["push", "app:1"]],
    ["prune", { confirm: true, kind: "builder" }, ["builder", "prune", "--force"]],
    // The procedures before R41, through the registry
    ["build", { context: ".", tag: "app:1", dockerfile: "Dockerfile.dev", buildArgs: { A: "1" }, noCache: true }, ["build", "-t", "app:1", "-f", "Dockerfile.dev", "--build-arg", "A=1", "--no-cache", "."]],
    ["build", { context: "ctx", tag: "app:2" }, ["build", "-t", "app:2", "ctx"]],
    ["ps", { all: true, filter: "name=web", format: "{{.Names}}" }, ["ps", "-a", "--filter", "name=web", "--format", "{{.Names}}"]],
    ["ps", {}, ["ps"]],
    ["pull", { image: "nginx", tag: "1.27" }, ["pull", "nginx:1.27"]],
    ["pull", { image: "nginx" }, ["pull", "nginx"]],
    ["stop", { containers: ["web", "db"], time: 3 }, ["stop", "-t", "3", "web", "db"]],
    ["stop", { containers: ["web"] }, ["stop", "web"]],
    ["rm", { containers: ["web"], force: true, volumes: true }, ["rm", "-f", "-v", "web"]],
    ["rm", { containers: ["web"] }, ["rm", "web"]],
    ["run", { image: "alpine" }, ["run", "alpine"]],
    ["run", { image: "alpine", detach: true, volumes: ["/data:/data"] }, ["run", "-d", "-v", "/data:/data", "alpine"]],
    ["logs", { container: "web", tail: 5 }, ["logs", "--tail", "5", "web"]],
    ["compose.up", { detach: true }, ["compose", "up", "-d"]],
    ["compose.down", { volumes: true }, ["compose", "down", "-v"]],
    ["exec", { container: "web", command: "ls", interactive: true, tty: true, workdir: "/app", env: { A: "1" } }, ["exec", "-i", "-t", "-w", "/app", "-e", "A=1", "web", "ls"]],
  ];

  for (const [operation, input, args] of CASES) {
    it(`docker.${operation} ${JSON.stringify(input)}`, async () => {
      const shell = fakeShell();
      expect(await docker(operation, input, shell.client)).toMatchObject({ success: true, exitCode: 0 });
      expect(shell.args()).toEqual(args);
    });
  }

  it("registers the module and the shell module in a registry", () => {
    const target = createRegistry();
    registerDockerProcedures(target);
    expect(target.has(["docker", "prune"])).toBe(true);
    expect(target.has(["shell", "run"])).toBe(true);
  });

  it("gives a failed result, not an error, when the shell fails", async () => {
    const call = vi.fn().mockRejectedValue(new Error("spawn docker ENOENT"));
    const result = await docker("images", {}, { call } as unknown as ProcedureClient);
    expect(result).toMatchObject({ success: false, exitCode: 1, stderr: "spawn docker ENOENT" });
  });
});

describe("the effects of the docker procedures", () => {
  const READS: Effects = { reads: ["docker"], writes: [] };
  const COMPOSE_READS: Effects = { reads: ["docker", "fs"], writes: [] };

  it("are declared for each procedure, and each one declares shell.run", () => {
    const declared = Object.fromEntries(dockerModule.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.effects]));
    expect(declared).toMatchObject({
      "docker.compose.ps": COMPOSE_READS,
      "docker.compose.logs": COMPOSE_READS,
      "docker.compose.build": { reads: ["docker", "fs", "network"], writes: ["docker", "process"], destructive: false },
      "docker.compose.restart": { reads: ["docker", "fs"], writes: ["docker"] },
      "docker.images": READS,
      "docker.inspect": READS,
      "docker.volume.list": READS,
      "docker.volume.create": { reads: ["docker"], writes: ["docker"], destructive: false, idempotent: true },
      "docker.volume.remove": { reads: ["docker"], writes: ["docker"], destructive: true, idempotent: true },
      "docker.network.list": READS,
      "docker.network.create": { reads: ["docker"], writes: ["docker"], destructive: false, idempotent: true },
      "docker.network.remove": { reads: ["docker"], writes: ["docker"], destructive: true, idempotent: true },
      "docker.tag": { reads: ["docker"], writes: ["docker"], idempotent: true },
      "docker.push": { reads: ["docker", "network"], writes: ["network"], idempotent: true },
      "docker.prune": { reads: ["docker"], writes: ["docker"], destructive: true, idempotent: true },
    });
    for (const procedure of dockerModule.procedures) {
      expect(procedure.metadata.calls, procedure.path.join(".")).toContain("shell.run");
    }
  });
});
