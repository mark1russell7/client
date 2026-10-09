/**
 * Unit tests for docker.compose procedures
 */

import { describe, it, expect, vi } from "vitest";
import { dockerComposeUp } from "../src/procedures/docker/up.js";
import { dockerComposeDown } from "../src/procedures/docker/down.js";
import type { ProcedureContext } from "@mark1russell7/client";

/**
 * The command line of the first shell call. The procedures call shell.run with an argument
 * list (no shell), so the test checks the call and joins the arguments to read them.
 */
function commandLine(callMock: ReturnType<typeof vi.fn>): string {
  const [path, input] = callMock.mock.calls[0] ?? [];
  expect(path).toEqual(["shell", "run"]);
  expect(Array.isArray(input.args)).toBe(true);
  return [input.command, ...input.args].join(" ");
}

// Helper to create mock context
function createMockContext(shellResponse: { exitCode: number; stdout: string; stderr: string }) {
  const callMock = vi.fn().mockResolvedValue(shellResponse);
  return {
    client: { call: callMock },
    callMock,
  } as unknown as { client: ProcedureContext["client"]; callMock: ReturnType<typeof vi.fn> };
}

describe("docker.compose.up", () => {
  it("should start services in detached mode", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "Creating network...\nCreating mongodb-1...\nStarted",
      stderr: "",
    });

    const result = await dockerComposeUp({ detach: true }, { client } as ProcedureContext);

    expect(result.success).toBe(true);
    const cmd = commandLine(callMock);
    expect(cmd).toContain("docker compose up");
    expect(cmd).toContain("-d");
  });

  it("should use custom compose file", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "Started",
      stderr: "",
    });

    await dockerComposeUp({ file: "docker-compose.test.yml", detach: true }, { client } as ProcedureContext);

    const cmd = commandLine(callMock);
    expect(cmd).toContain("-f docker-compose.test.yml");
  });

  it("should build before starting", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "Building...\nStarted",
      stderr: "",
    });

    await dockerComposeUp({ build: true, detach: true }, { client } as ProcedureContext);

    const cmd = commandLine(callMock);
    expect(cmd).toContain("--build");
  });

  it("should start specific services", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "Started mongodb",
      stderr: "",
    });

    await dockerComposeUp({
      services: ["mongodb", "redis"],
      detach: true,
    }, { client } as ProcedureContext);

    const cmd = commandLine(callMock);
    expect(cmd).toContain("mongodb");
    expect(cmd).toContain("redis");
  });
});

describe("docker.compose.down", () => {
  it("should stop services", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "Stopping...\nRemoving...",
      stderr: "",
    });

    const result = await dockerComposeDown({}, { client } as ProcedureContext);

    expect(result.success).toBe(true);
    const cmd = commandLine(callMock);
    expect(cmd).toContain("docker compose down");
  });

  it("should remove volumes", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "Removed volumes",
      stderr: "",
    });

    await dockerComposeDown({ volumes: true }, { client } as ProcedureContext);

    const cmd = commandLine(callMock);
    expect(cmd).toContain("-v");
  });

  it("should remove images", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "Removed images",
      stderr: "",
    });

    await dockerComposeDown({ rmi: "all" }, { client } as ProcedureContext);

    const cmd = commandLine(callMock);
    expect(cmd).toContain("--rmi all");
  });

  it("should remove orphans", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "Removed orphans",
      stderr: "",
    });

    await dockerComposeDown({ removeOrphans: true }, { client } as ProcedureContext);

    const cmd = commandLine(callMock);
    expect(cmd).toContain("--remove-orphans");
  });
});
