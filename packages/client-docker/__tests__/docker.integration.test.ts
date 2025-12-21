/**
 * Real Docker Integration Tests
 *
 * These tests actually call Docker - not mocked.
 * Requires Docker to be running.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";

// Helper to run docker commands
function docker(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`docker ${args}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

// Check if Docker is available
function isDockerAvailable(): boolean {
  const result = docker("info");
  return result.exitCode === 0;
}

describe.skipIf(!isDockerAvailable())("Docker Integration (Real)", () => {
  const testContainerName = "client-docker-test-" + Date.now();

  afterAll(() => {
    // Cleanup: remove test container if it exists
    docker(`rm -f ${testContainerName}`);
  });

  it("should run docker ps", () => {
    const result = docker("ps");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CONTAINER ID");
  });

  it("should pull alpine image", () => {
    const result = docker("pull alpine:latest");
    expect(result.exitCode).toBe(0);
    // Either "Pull complete" for new pull or "Image is up to date" for cached
    expect(result.stdout.toLowerCase()).toMatch(/pull complete|up to date|already exists/i);
  });

  it("should run a container and get output", () => {
    const result = docker(`run --rm alpine:latest echo "hello from docker"`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from docker");
  });

  it("should run a named container in detached mode", () => {
    // Run container
    const runResult = docker(`run -d --name ${testContainerName} alpine:latest sleep 30`);
    expect(runResult.exitCode).toBe(0);
    expect(runResult.stdout).toMatch(/^[a-f0-9]{64}$/); // Container ID

    // Check it's running
    const psResult = docker(`ps --filter name=${testContainerName} --format "{{.Names}}"`);
    expect(psResult.exitCode).toBe(0);
    expect(psResult.stdout).toContain(testContainerName);

    // Stop it
    const stopResult = docker(`stop ${testContainerName}`);
    expect(stopResult.exitCode).toBe(0);
  });

  it("should exec into a running container", () => {
    // Start a container
    const containerName = testContainerName + "-exec";
    docker(`run -d --name ${containerName} alpine:latest sleep 30`);

    try {
      // Exec into it
      const execResult = docker(`exec ${containerName} echo "exec works"`);
      expect(execResult.exitCode).toBe(0);
      expect(execResult.stdout).toContain("exec works");
    } finally {
      // Cleanup
      docker(`rm -f ${containerName}`);
    }
  });

  it("should get container logs", () => {
    const containerName = testContainerName + "-logs";

    // Run container that outputs something
    docker(`run -d --name ${containerName} alpine:latest sh -c "echo 'log line 1' && echo 'log line 2' && sleep 5"`);

    try {
      // Wait a moment for logs
      execSync("sleep 1");

      // Get logs
      const logsResult = docker(`logs ${containerName}`);
      expect(logsResult.exitCode).toBe(0);
      expect(logsResult.stdout).toContain("log line 1");
      expect(logsResult.stdout).toContain("log line 2");
    } finally {
      docker(`rm -f ${containerName}`);
    }
  });

  it("should list images", () => {
    const result = docker("images --format '{{.Repository}}:{{.Tag}}'");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("alpine:latest");
  });
});

describe.skipIf(!isDockerAvailable())("Docker Compose Integration (Real)", () => {
  it("should show docker compose version", () => {
    const result = docker("compose version");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Docker Compose");
  });
});
