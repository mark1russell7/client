/**
 * The docker.* procedures against a real Docker daemon (roadmap R32). The nightly workflow sets
 * `LIVE_DOCKER=1`. `pnpm test` leaves out the files `*.integration.test.ts`.
 *
 * The other integration test calls the docker CLI itself. This one calls the procedures through
 * a registry, as a host does: the validation, the shell module and the outputs.
 */

import { afterAll, describe, expect, it } from "vitest";
import { Client, createRegistry } from "@procedures/client";
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
