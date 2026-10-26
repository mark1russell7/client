/**
 * Unit tests for docker.run procedure
 */

import { describe, it, expect } from "vitest";
import { fakeShell, type FakeShell } from "@procedures/shell/testing";
import { dockerRun } from "../src/procedures/docker/run.js";
import type { ProcedureContext } from "@procedures/client";

/**
 * The command line of the first shell call. The procedures call shell.run with an argument
 * list (no shell), so the test checks the call and joins the arguments to read them.
 */
function commandLine(shell: FakeShell): string {
  const input = shell.calls[0];
  expect(input).toBeDefined();
  return [input!.command, ...shell.args(0)].join(" ");
}

/** A context whose client is the fake shell of `@procedures/shell/testing`, with one scripted result. */
function createMockContext(shellResponse: { exitCode: number; stdout: string; stderr: string }) {
  const shell = fakeShell(shellResponse);
  return { client: shell.client, shell };
}

describe("docker.run", () => {
  it("should run a simple container", async () => {
    const { client, shell } = createMockContext({
      exitCode: 0,
      stdout: "container-id-abc123",
      stderr: "",
    });

    const result = await dockerRun({ image: "nginx:latest" }, { client } as ProcedureContext);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(shell.calls).toHaveLength(1);
    expect(commandLine(shell)).toContain("docker run");
    expect(commandLine(shell)).toContain("nginx:latest");
  });

  it("should add -d flag for detached mode", async () => {
    const { client, shell } = createMockContext({
      exitCode: 0,
      stdout: "abc123",
      stderr: "",
    });

    await dockerRun({ image: "nginx", detach: true }, { client } as ProcedureContext);

    expect(commandLine(shell)).toContain("-d");
  });

  it("should add --name flag", async () => {
    const { client, shell } = createMockContext({
      exitCode: 0,
      stdout: "abc123",
      stderr: "",
    });

    await dockerRun({ image: "nginx", name: "my-nginx" }, { client } as ProcedureContext);

    expect(commandLine(shell)).toContain("--name my-nginx");
  });

  it("should add port mappings", async () => {
    const { client, shell } = createMockContext({
      exitCode: 0,
      stdout: "abc123",
      stderr: "",
    });

    await dockerRun({
      image: "nginx",
      ports: ["8080:80", "443:443"],
    }, { client } as ProcedureContext);

    const cmd = commandLine(shell);
    expect(cmd).toContain("-p 8080:80");
    expect(cmd).toContain("-p 443:443");
  });

  it("should add environment variables", async () => {
    const { client, shell } = createMockContext({
      exitCode: 0,
      stdout: "abc123",
      stderr: "",
    });

    await dockerRun({
      image: "nginx",
      env: { NODE_ENV: "production", DEBUG: "true" },
    }, { client } as ProcedureContext);

    const cmd = commandLine(shell);
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
    const { client, shell } = createMockContext({ exitCode: 0, stdout: "", stderr: "" });
    await dockerRun({ image: "alpine", name: "x & echo INJECTED> marker" }, { client } as ProcedureContext);
    const input = shell.calls[0];
    expect(input?.command).toBe("docker");
    expect(input?.args).toContain("x & echo INJECTED> marker");
  });

  it("rejects an image that docker would read as an option", async () => {
    const { client, shell } = createMockContext({ exitCode: 0, stdout: "", stderr: "" });
    await expect(dockerRun({ image: "--privileged" }, { client } as ProcedureContext)).rejects.toThrow("starts with");
    expect(shell.calls).toEqual([]);
  });
});
