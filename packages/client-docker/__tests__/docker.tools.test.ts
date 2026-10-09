/**
 * A smoke test of each docker.* tool of the MCP server: the test calls each one through the
 * registry, as the MCP server does, with a small valid input.
 *
 * Docker is not needed. Without a docker daemon (or without the docker program), each tool
 * gives a failed result, and the test checks only that the failure comes from docker: not from
 * the wiring (a missing shell.run, an input that the schema rejects, a thrown error). With a
 * docker daemon, docker.ps must also succeed.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { runCommand } from "@mark1russell7/client-shell/command";
// The package's own registration, as in the MCP server (it registers client-shell too)
import "../src/register.js";
import type { DockerCommandOutput } from "../src/types.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));
const cwd = mkdtempSync(join(tmpdir(), "client-docker-"));
const name = `client-docker-smoke-${process.pid}`;

/** Each exposed tool, with a small valid input. No call changes anything that exists. */
const TOOLS: Array<[operation: string, input: Record<string, unknown>]> = [
  ["ps", { all: true }],
  ["logs", { container: name, tail: 1 }],
  ["pull", { image: "client-docker-smoke-no-such-image", tag: "none" }],
  ["build", { context: cwd, tag: `${name}:none` }],
  ["run", { image: "client-docker-smoke-no-such-image", rm: true, name }],
  ["exec", { container: name, command: "true" }],
  ["stop", { containers: [name] }],
  ["rm", { containers: [name] }],
  ["compose.up", { cwd, file: join(cwd, "no-compose.yml") }],
  ["compose.down", { cwd, file: join(cwd, "no-compose.yml") }],
];

/** The wiring failed: the call never reached docker. */
const WIRING = /Procedure not found|No handler|not registered|Input validation failed|is not a function|Cannot read properties/i;

describe("docker tools through the registry", () => {
  for (const [operation, input] of TOOLS) {
    it(`docker.${operation} reaches docker`, async () => {
      const result = await client.call<unknown, DockerCommandOutput>(
        { service: "docker", operation },
        { ...input, timeout: 30_000 },
      );
      expect(typeof result.exitCode).toBe("number");
      expect(typeof result.success).toBe("boolean");
      expect(result.stderr).not.toMatch(WIRING);
    }, 60_000);
  }

  it("docker.ps succeeds when a docker daemon runs", async () => {
    const daemon = await runCommand("docker", { args: ["info"], timeout: 30_000 });
    if (!daemon.success) return;
    const result = await client.call<unknown, DockerCommandOutput>({ service: "docker", operation: "ps" }, {});
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("CONTAINER ID");
  }, 60_000);
});
