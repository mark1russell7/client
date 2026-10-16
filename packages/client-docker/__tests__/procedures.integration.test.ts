/**
 * The docker.* procedures against a real Docker daemon (roadmap R32). The nightly workflow sets
 * `LIVE_DOCKER=1`. `pnpm test` leaves out the files `*.integration.test.ts`.
 *
 * The other integration test calls the docker CLI itself. This one calls the procedures through
 * a registry, as a host does: the validation, the shell module and the outputs.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, createRegistry } from "@procedures/client";
import { runCommand } from "@procedures/shell/command";
import dockerModule from "../src/module.js";

const live = process.env["LIVE_DOCKER"] === "1";
const name = `procedures-live-${Date.now().toString(36)}`;
const stub = { name: "stub", send: async function* () {}, close: async () => {} } as unknown as ConstructorParameters<typeof Client>[0];
const client = new Client(stub).useRegistry(createRegistry(dockerModule));

interface Output {
  exitCode: number;
  stdout: string;
  success: boolean;
}

const docker = (operation: string, input: unknown): Promise<Output> => client.exec<Output>({ $proc: ["docker", operation], input });

describe.runIf(live)("docker.* against a real daemon (R32)", () => {
  afterAll(async () => {
    await docker("rm", { containers: [name], force: true }).catch(() => undefined);
  });

  it("pulls an image", async () => {
    expect(await docker("pull", { image: "alpine:3.20" })).toMatchObject({ success: true });
  }, 120_000);

  it("runs a container and gives its output", async () => {
    const result = await docker("run", { image: "alpine:3.20", rm: true, command: "echo hello-from-a-procedure" });
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("hello-from-a-procedure");
  }, 60_000);

  it("runs a detached container, lists it, reads its logs, stops it and removes it", async () => {
    // `command` is split at whitespace, without a shell: ping writes a line each second
    expect(await docker("run", { image: "alpine:3.20", name, detach: true, command: "ping -c 120 127.0.0.1" })).toMatchObject({ success: true });
    const listed = await docker("ps", { filter: `name=${name}` });
    expect(listed.stdout).toContain(name);
    // The container writes its line at once, but give it a moment on a slow runner
    let logs = "";
    for (let attempt = 0; attempt < 20 && !logs.includes("127.0.0.1"); attempt++) {
      logs = (await docker("logs", { container: name, tail: 10 })).stdout;
      if (!logs.includes("127.0.0.1")) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(logs).toContain("127.0.0.1");
    expect(await docker("stop", { containers: [name] })).toMatchObject({ success: true });
    expect(await docker("rm", { containers: [name] })).toMatchObject({ success: true });
    expect((await docker("ps", { all: true, filter: `name=${name}` })).stdout).not.toContain(name);
  }, 120_000);

  it("gives the exit code of a failed command, and does not throw", async () => {
    const result = await docker("run", { image: "alpine:3.20", rm: true, command: "false" });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  }, 60_000);
});

/** A procedure of a nested path, for example "compose.ps" or "volume.create". */
const dockerAt = (operation: string, input: unknown): Promise<Output & { data?: unknown }> =>
  client.exec<Output & { data?: unknown }>({ $proc: ["docker", ...operation.split(".")], input });

/** This function retries a call until it succeeds: a new container needs a moment. */
async function eventually(call: () => Promise<Output>, attempts = 20): Promise<Output> {
  let result = await call();
  for (let attempt = 1; attempt < attempts && !result.success; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    result = await call();
  }
  return result;
}

describe.runIf(live)("the docker.* procedures of roadmap R41 against a real daemon", () => {
  const tag = `${name}-tag:1`;
  const volume = `${name}-volume`;
  const network = `${name}-network`;
  const pruned = `${name}-pruned`;
  const registry = `${name}-registry`;
  /** The folder of the compose project (the folder name is the project name). */
  let project = "";

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), "procedures-live-compose-"));
  });

  afterAll(async () => {
    // Clean up with the docker CLI, also after a failed test
    for (const args of [
      ["rm", "-f", registry, `${name}-exec`],
      ["rmi", "-f", tag, `localhost:5000/${name}:1`],
      ["volume", "rm", "-f", volume],
      ["network", "rm", network, pruned],
      ["compose", "down", "--rmi", "local", "--volumes"],
    ]) {
      await runCommand("docker", { args, cwd: project, timeout: 120_000 });
    }
    rmSync(project, { recursive: true, force: true });
  }, 180_000);

  it("runs a command of args with a quoted argument, and execs one in a container", async () => {
    await docker("pull", { image: "alpine:3.20" });
    const run = await docker("run", { image: "alpine:3.20", rm: true, args: ["sh", "-c", "echo 'hello world'"] });
    expect(run.stdout.trim()).toBe("hello world");
    expect(await docker("run", { image: "alpine:3.20", name: `${name}-exec`, detach: true, args: ["sleep", "120"] })).toMatchObject({ success: true });
    const exec = await docker("exec", { container: `${name}-exec`, args: ["sh", "-c", "printf '%s' 'a b'"] });
    expect(exec.stdout).toBe("a b");
  }, 120_000);

  it("lists, inspects and tags an image", async () => {
    expect((await docker("images", { repository: "alpine" })).stdout).toContain("3.20");
    const inspected = await dockerAt("inspect", { targets: ["alpine:3.20"], type: "image" });
    expect(inspected.success).toBe(true);
    expect(inspected.data).toEqual([expect.objectContaining({ RepoTags: expect.arrayContaining(["alpine:3.20"]) })]);
    expect(await docker("tag", { source: "alpine:3.20", target: tag })).toMatchObject({ success: true });
    expect((await docker("images", { repository: tag.split(":")[0] })).stdout).toContain(tag.split(":")[0]);
  }, 120_000);

  it("pushes an image to a local registry", async () => {
    expect(await docker("run", { image: "registry:2", name: registry, detach: true, ports: ["5000:5000"] })).toMatchObject({ success: true });
    const target = `localhost:5000/${name}:1`;
    expect(await docker("tag", { source: "alpine:3.20", target })).toMatchObject({ success: true });
    expect(await eventually(() => docker("push", { image: target }))).toMatchObject({ success: true });
  }, 180_000);

  it("creates, lists, inspects and removes a volume", async () => {
    expect(await dockerAt("volume.create", { name: volume, labels: { "procedures-live": name } })).toMatchObject({ success: true });
    expect((await dockerAt("volume.list", { filter: `name=${volume}` })).stdout).toContain(volume);
    const inspected = await dockerAt("inspect", { targets: [volume], type: "volume" });
    expect(inspected.data).toEqual([expect.objectContaining({ Name: volume, Labels: { "procedures-live": name } })]);
    expect(await dockerAt("volume.remove", { volumes: [volume] })).toMatchObject({ success: true });
    expect((await dockerAt("volume.list", { filter: `name=${volume}` })).stdout).not.toContain(volume);
  }, 60_000);

  it("creates, lists and removes a network, and prunes only the networks of a label", async () => {
    expect(await dockerAt("network.create", { name: network, internal: true })).toMatchObject({ success: true });
    expect((await dockerAt("network.list", { filter: `name=${network}` })).stdout).toContain(network);
    expect(await dockerAt("network.create", { name: network })).toMatchObject({ success: false });
    expect(await dockerAt("network.remove", { networks: [network] })).toMatchObject({ success: true });

    expect(await dockerAt("network.create", { name: pruned, labels: { "procedures-live": name } })).toMatchObject({ success: true });
    const prune = await dockerAt("prune", { kind: "network", filter: `label=procedures-live=${name}`, confirm: true });
    expect(prune).toMatchObject({ success: true });
    expect((await dockerAt("network.list", { filter: `name=${pruned}` })).stdout).not.toContain(pruned);
  }, 60_000);

  it("builds, starts, lists, reads the logs of, restarts and stops a compose project", async () => {
    writeFileSync(join(project, "Dockerfile"), "FROM alpine:3.20\n");
    writeFileSync(
      join(project, "compose.yml"),
      ["services:", "  app:", "    build: .", `    image: ${name}-compose-app`, '    command: ["sh", "-c", "echo compose-ready && sleep 300"]', ""].join("\n"),
    );
    const cwd = project;
    expect(await dockerAt("compose.build", { cwd })).toMatchObject({ success: true });
    expect(await dockerAt("compose.up", { cwd, detach: true })).toMatchObject({ success: true });
    expect((await dockerAt("compose.ps", { cwd, services: ["app"] })).stdout).toContain("app");
    const logs = await eventually(async () => {
      const result = await dockerAt("compose.logs", { cwd, tail: 10 });
      return { ...result, success: result.stdout.includes("compose-ready") };
    });
    expect(logs.stdout).toContain("compose-ready");
    expect(await dockerAt("compose.restart", { cwd, time: 1 })).toMatchObject({ success: true });
    expect(await dockerAt("compose.down", { cwd, rmi: "local" })).toMatchObject({ success: true });
  }, 300_000);
});
