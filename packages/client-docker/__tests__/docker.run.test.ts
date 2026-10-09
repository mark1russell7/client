/**
 * Unit tests for docker.run procedure
 */

import { describe, it, expect, vi } from "vitest";
import { dockerRun } from "../src/procedures/docker/run.js";
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

describe("docker.run", () => {
  it("should run a simple container", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "container-id-abc123",
      stderr: "",
    });

    const result = await dockerRun({ image: "nginx:latest" }, { client } as ProcedureContext);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(callMock).toHaveBeenCalledOnce();
    expect(commandLine(callMock)).toContain("docker run");
    expect(commandLine(callMock)).toContain("nginx:latest");
  });

  it("should add -d flag for detached mode", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "abc123",
      stderr: "",
    });

    await dockerRun({ image: "nginx", detach: true }, { client } as ProcedureContext);

    expect(commandLine(callMock)).toContain("-d");
  });

  it("should add --name flag", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "abc123",
      stderr: "",
    });

    await dockerRun({ image: "nginx", name: "my-nginx" }, { client } as ProcedureContext);

    expect(commandLine(callMock)).toContain("--name my-nginx");
  });

  it("should add port mappings", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "abc123",
      stderr: "",
    });

    await dockerRun({
      image: "nginx",
      ports: ["8080:80", "443:443"],
    }, { client } as ProcedureContext);

    const cmd = commandLine(callMock);
    expect(cmd).toContain("-p 8080:80");
    expect(cmd).toContain("-p 443:443");
  });

  it("should add environment variables", async () => {
    const { client, callMock } = createMockContext({
      exitCode: 0,
      stdout: "abc123",
      stderr: "",
    });

    await dockerRun({
      image: "nginx",
      env: { NODE_ENV: "production", DEBUG: "true" },
    }, { client } as ProcedureContext);

    const cmd = commandLine(callMock);
    expect(cmd).toContain("-e NODE_ENV=production");
    expect(cmd).toContain("-e DEBUG=true");
  });

  it("should handle command failure", async () => {
    const { client } = createMockContext({
      exitCode: 1,
      stdout: "",
      stderr: "Unable to find image 'nonexistent:latest' locally",
    });

    const result = await dockerRun({ image: "nonexistent" }, { client } as ProcedureContext);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unable to find image");
  });

  it("should track duration", async () => {
    const { client } = createMockContext({
      exitCode: 0,
      stdout: "abc123",
      stderr: "",
    });

    const result = await dockerRun({ image: "nginx" }, { client } as ProcedureContext);

    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(typeof result.duration).toBe("number");
  });
});

describe("docker procedures do not run a shell (deep dive WRP-1)", () => {
  it("passes a hostile value as one argument, not as shell syntax", async () => {
    const { client, callMock } = createMockContext({ exitCode: 0, stdout: "", stderr: "" });
    await dockerRun({ image: "alpine", name: "x & echo INJECTED> marker" }, { client } as ProcedureContext);
    const input = callMock.mock.calls[0]?.[1];
    expect(callMock.mock.calls[0]?.[0]).toEqual(["shell", "run"]);
    expect(input.command).toBe("docker");
    expect(input.args).toContain("x & echo INJECTED> marker");
  });

  it("rejects an image that docker would read as an option", async () => {
    const { client, callMock } = createMockContext({ exitCode: 0, stdout: "", stderr: "" });
    await expect(dockerRun({ image: "--privileged" }, { client } as ProcedureContext)).rejects.toThrow("starts with");
    expect(callMock).not.toHaveBeenCalled();
  });
});
