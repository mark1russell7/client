/**
 * Integration tests for aggregation primitives
 *
 * Tests verify that aggregations correctly compose procedure calls
 * by mocking the underlying procedures and verifying call sequences.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  gitCommitAndPushAggregation,
  gitInitWorkflowAggregation,
  gitPullAggregation,
  pnpmInstallAndBuildAggregation,
  pnpmInstallAggregation,
  forceCleanupAggregation,
  ensureDirAggregation,
} from "./index.js";
import type { AggregationDefinition } from "@mark1russell7/client";

/**
 * Mock client for testing aggregation execution
 */
function createTestMockClient() {
  const calls: Array<{ path: string[]; input: unknown }> = [];
  const responses = new Map<string, { output?: unknown; error?: Error }>();
  const implementations = new Map<string, (input: unknown) => unknown>();

  const pathToKey = (path: readonly string[]): string => path.join(".");

  const call = vi.fn(async (path: readonly string[], input: unknown) => {
    calls.push({ path: [...path], input });
    const key = pathToKey(path);
    const impl = implementations.get(key);
    if (impl) return impl(input);
    const response = responses.get(key);
    if (response?.error) throw response.error;
    return response?.output ?? {};
  });

  return {
    call,
    getCalls: () => [...calls],
    getCallsFor: (path: readonly string[]) =>
      calls.filter((c) => pathToKey(c.path) === pathToKey(path)),
    mockResponse: <T>(path: readonly string[], response: { output?: T; error?: Error }) => {
      responses.set(pathToKey(path), response);
    },
    mockImplementation: <TInput, TOutput>(
      path: readonly string[],
      impl: (input: TInput) => TOutput | Promise<TOutput>
    ) => {
      implementations.set(pathToKey(path), impl as (input: unknown) => unknown);
    },
    reset: () => {
      calls.length = 0;
      responses.clear();
      implementations.clear();
      call.mockClear();
    },
  };
}

/**
 * Execute an aggregation definition with a mock client
 * Simplified executor that handles chain, conditional, tryCatch, identity patterns
 */
async function executeAggregation(
  aggregation: AggregationDefinition,
  input: Record<string, unknown>,
  client: ReturnType<typeof createTestMockClient>
): Promise<unknown> {
  const context: Record<string, unknown> = { input };

  // Resolve $ref references
  const resolveRef = (ref: string): unknown => {
    const parts = ref.split(".");
    let value: unknown = context;
    for (const part of parts) {
      if (value == null || typeof value !== "object") return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  };

  // Resolve template strings like "{{input.cwd}}/node_modules"
  const resolveTemplate = (str: string): string => {
    return str.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const value = resolveRef(path);
      return value != null ? String(value) : "";
    });
  };

  // Resolve input object, handling $ref patterns
  // preserveAggDef: if true, preserve $proc/$name for nested aggregations
  const resolveInput = (obj: unknown, preserveAggDef = false): unknown => {
    if (obj == null) return obj;
    if (typeof obj === "string") {
      if (obj.includes("{{")) return resolveTemplate(obj);
      return obj;
    }
    if (Array.isArray(obj)) return obj.map((item) => resolveInput(item, preserveAggDef));
    if (typeof obj === "object") {
      const record = obj as Record<string, unknown>;
      if ("$ref" in record && typeof record.$ref === "string") {
        const value = resolveRef(record.$ref);
        if (record.invert) return !value;
        return value;
      }
      // If this object has $proc, it's an aggregation definition - preserve it
      if ("$proc" in record) {
        const result: Record<string, unknown> = {
          $proc: record.$proc,
        };
        if ("$name" in record) result.$name = record.$name;
        if ("input" in record) result.input = record.input; // Don't resolve yet
        return result;
      }
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        result[key] = resolveInput(value, preserveAggDef);
      }
      return result;
    }
    return obj;
  };

  // Execute a step
  const executeStep = async (step: AggregationDefinition): Promise<unknown> => {
    const proc = step.$proc;
    const name = step.$name;
    const stepInput = resolveInput(step.input);

    let result: unknown;

    // Handle built-in procedures
    if (proc[0] === "client") {
      switch (proc[1]) {
        case "chain": {
          const chainInput = stepInput as { steps: AggregationDefinition[] };
          let last: unknown;
          for (const s of chainInput.steps) {
            last = await executeStep(s);
          }
          result = last;
          break;
        }
        case "conditional": {
          const condInput = stepInput as {
            condition: boolean;
            then?: AggregationDefinition;
            else?: AggregationDefinition;
          };
          if (condInput.condition && condInput.then) {
            result = await executeStep(condInput.then as AggregationDefinition);
          } else if (!condInput.condition && condInput.else) {
            result = await executeStep(condInput.else as AggregationDefinition);
          }
          break;
        }
        case "tryCatch": {
          const tryInput = stepInput as {
            try: AggregationDefinition;
            catch: unknown;
          };
          try {
            result = await executeStep(tryInput.try as AggregationDefinition);
          } catch {
            result = tryInput.catch;
          }
          break;
        }
        case "identity": {
          result = stepInput;
          break;
        }
        case "throw": {
          const throwInput = stepInput as { message: string };
          throw new Error(throwInput.message);
        }
        default:
          result = await client.call(proc, stepInput);
      }
    } else {
      result = await client.call(proc, stepInput);
    }

    // Store named result
    if (name) {
      context[name] = result;
    }

    return result;
  };

  return executeStep(aggregation);
}

describe("gitCommitAndPushAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    // Set up default successful responses
    client.mockResponse(["git", "add"], { output: { staged: true } });
    client.mockResponse(["git", "commit"], { output: { sha: "abc123", message: "test" } });
    client.mockResponse(["git", "push"], { output: { pushed: true } });
  });

  it("executes git add, commit, push in sequence", async () => {
    const result = await executeAggregation(
      gitCommitAndPushAggregation,
      { cwd: "/test/repo", message: "Test commit" },
      client
    );

    const calls = client.getCalls();
    expect(calls).toHaveLength(3);
    expect(calls[0]?.path).toEqual(["git", "add"]);
    expect(calls[1]?.path).toEqual(["git", "commit"]);
    expect(calls[2]?.path).toEqual(["git", "push"]);
  });

  it("passes cwd to all git commands", async () => {
    await executeAggregation(
      gitCommitAndPushAggregation,
      { cwd: "/my/project", message: "commit" },
      client
    );

    const calls = client.getCalls();
    expect((calls[0]?.input as { cwd: string }).cwd).toBe("/my/project");
    expect((calls[1]?.input as { cwd: string }).cwd).toBe("/my/project");
    expect((calls[2]?.input as { cwd: string }).cwd).toBe("/my/project");
  });

  it("passes message to git commit", async () => {
    await executeAggregation(
      gitCommitAndPushAggregation,
      { cwd: "/repo", message: "My commit message" },
      client
    );

    const commitCall = client.getCallsFor(["git", "commit"])[0];
    expect((commitCall?.input as { message: string }).message).toBe("My commit message");
  });

  it("stages all files with all: true", async () => {
    await executeAggregation(
      gitCommitAndPushAggregation,
      { cwd: "/repo", message: "test" },
      client
    );

    const addCall = client.getCallsFor(["git", "add"])[0];
    expect((addCall?.input as { all: boolean }).all).toBe(true);
  });

  it("returns success result with staged and commit info", async () => {
    client.mockResponse(["git", "commit"], { output: { sha: "def456" } });

    const result = await executeAggregation(
      gitCommitAndPushAggregation,
      { cwd: "/repo", message: "test" },
      client
    ) as { success: boolean; pushed: boolean };

    expect(result.success).toBe(true);
    expect(result.pushed).toBe(true);
  });
});

describe("gitInitWorkflowAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["git", "init"], { output: { initialized: true } });
    client.mockResponse(["git", "add"], { output: { staged: true } });
    client.mockResponse(["git", "commit"], { output: { sha: "init123" } });
    client.mockResponse(["shell", "exec"], { output: { success: true } });
  });

  it("initializes git repository", async () => {
    await executeAggregation(
      gitInitWorkflowAggregation,
      { cwd: "/new/repo", message: "Initial commit" },
      client
    );

    const initCall = client.getCallsFor(["git", "init"])[0];
    expect(initCall).toBeDefined();
    expect((initCall?.input as { cwd: string }).cwd).toBe("/new/repo");
  });

  it("stages all files after init", async () => {
    await executeAggregation(
      gitInitWorkflowAggregation,
      { cwd: "/new/repo", message: "Initial" },
      client
    );

    const calls = client.getCalls();
    const initIdx = calls.findIndex((c) => c.path.join(".") === "git.init");
    const addIdx = calls.findIndex((c) => c.path.join(".") === "git.add");
    expect(addIdx).toBeGreaterThan(initIdx);
  });

  it("commits with provided message", async () => {
    await executeAggregation(
      gitInitWorkflowAggregation,
      { cwd: "/repo", message: "Initial commit message" },
      client
    );

    const commitCall = client.getCallsFor(["git", "commit"])[0];
    expect((commitCall?.input as { message: string }).message).toBe("Initial commit message");
  });

  it("skips remote creation when createRemote is false", async () => {
    await executeAggregation(
      gitInitWorkflowAggregation,
      { cwd: "/repo", message: "init", createRemote: false },
      client
    );

    const shellCalls = client.getCallsFor(["shell", "exec"]);
    expect(shellCalls).toHaveLength(0);
  });

  it("creates remote when createRemote is true", async () => {
    await executeAggregation(
      gitInitWorkflowAggregation,
      {
        cwd: "/repo",
        message: "init",
        createRemote: true,
        repoOwner: "owner",
        repoName: "repo",
      },
      client
    );

    const shellCalls = client.getCallsFor(["shell", "exec"]);
    expect(shellCalls).toHaveLength(1);
  });
});

describe("gitPullAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["git", "pull"], {
      output: { commits: 3, fastForward: true },
    });
  });

  it("executes git pull with remote", async () => {
    await executeAggregation(
      gitPullAggregation,
      { cwd: "/repo", remote: "origin" },
      client
    );

    const pullCall = client.getCallsFor(["git", "pull"])[0];
    expect(pullCall).toBeDefined();
    expect((pullCall?.input as { remote: string }).remote).toBe("origin");
  });

  it("passes rebase option", async () => {
    await executeAggregation(
      gitPullAggregation,
      { cwd: "/repo", rebase: true },
      client
    );

    const pullCall = client.getCallsFor(["git", "pull"])[0];
    expect((pullCall?.input as { rebase: boolean }).rebase).toBe(true);
  });

  it("returns success with commit info", async () => {
    client.mockResponse(["git", "pull"], {
      output: { commits: 5, fastForward: false },
    });

    const result = await executeAggregation(
      gitPullAggregation,
      { cwd: "/repo" },
      client
    ) as { success: boolean };

    expect(result.success).toBe(true);
  });
});

describe("pnpmInstallAndBuildAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["pnpm", "install"], {
      output: { success: true, exitCode: 0, duration: 1000 },
    });
    client.mockResponse(["pnpm", "run"], {
      output: { success: true, exitCode: 0, duration: 2000 },
    });
  });

  it("runs pnpm install then build", async () => {
    await executeAggregation(
      pnpmInstallAndBuildAggregation,
      { cwd: "/project" },
      client
    );

    const calls = client.getCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.path).toEqual(["pnpm", "install"]);
    expect(calls[1]?.path).toEqual(["pnpm", "run"]);
  });

  it("passes cwd to both commands", async () => {
    await executeAggregation(
      pnpmInstallAndBuildAggregation,
      { cwd: "/my/package" },
      client
    );

    const installCall = client.getCallsFor(["pnpm", "install"])[0];
    const buildCall = client.getCallsFor(["pnpm", "run"])[0];
    expect((installCall?.input as { cwd: string }).cwd).toBe("/my/package");
    expect((buildCall?.input as { cwd: string }).cwd).toBe("/my/package");
  });

  it("runs build script", async () => {
    await executeAggregation(
      pnpmInstallAndBuildAggregation,
      { cwd: "/project" },
      client
    );

    const buildCall = client.getCallsFor(["pnpm", "run"])[0];
    expect((buildCall?.input as { script: string }).script).toBe("build");
  });

  it("throws on install failure", async () => {
    client.mockResponse(["pnpm", "install"], {
      output: { success: false, exitCode: 1, stderr: "npm ERR!" },
    });

    await expect(
      executeAggregation(pnpmInstallAndBuildAggregation, { cwd: "/project" }, client)
    ).rejects.toThrow();
  });

  it("throws on build failure", async () => {
    client.mockResponse(["pnpm", "install"], {
      output: { success: true, exitCode: 0 },
    });
    client.mockResponse(["pnpm", "run"], {
      output: { success: false, exitCode: 1, stderr: "Build error" },
    });

    await expect(
      executeAggregation(pnpmInstallAndBuildAggregation, { cwd: "/project" }, client)
    ).rejects.toThrow();
  });

  it("returns success with timing info", async () => {
    client.mockResponse(["pnpm", "install"], {
      output: { success: true, exitCode: 0, duration: 500 },
    });
    client.mockResponse(["pnpm", "run"], {
      output: { success: true, exitCode: 0, duration: 1500 },
    });

    const result = await executeAggregation(
      pnpmInstallAndBuildAggregation,
      { cwd: "/project" },
      client
    ) as { success: boolean; install: { exitCode: number }; build: { exitCode: number } };

    expect(result.success).toBe(true);
    expect(result.install.exitCode).toBe(0);
    expect(result.build.exitCode).toBe(0);
  });
});

describe("pnpmInstallAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["pnpm", "install"], {
      output: { success: true, exitCode: 0, stdout: "installed", stderr: "" },
    });
  });

  it("runs pnpm install", async () => {
    await executeAggregation(pnpmInstallAggregation, { cwd: "/project" }, client);

    const calls = client.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toEqual(["pnpm", "install"]);
  });

  it("passes packages option", async () => {
    await executeAggregation(
      pnpmInstallAggregation,
      { cwd: "/project", packages: ["lodash", "zod"] },
      client
    );

    const installCall = client.getCallsFor(["pnpm", "install"])[0];
    expect((installCall?.input as { packages: string[] }).packages).toEqual([
      "lodash",
      "zod",
    ]);
  });

  it("passes dev option", async () => {
    await executeAggregation(
      pnpmInstallAggregation,
      { cwd: "/project", dev: true },
      client
    );

    const installCall = client.getCallsFor(["pnpm", "install"])[0];
    expect((installCall?.input as { dev: boolean }).dev).toBe(true);
  });

  it("returns install result", async () => {
    client.mockResponse(["pnpm", "install"], {
      output: { success: true, exitCode: 0, stdout: "Done!", stderr: "", duration: 100 },
    });

    const result = await executeAggregation(
      pnpmInstallAggregation,
      { cwd: "/project" },
      client
    ) as { success: boolean; exitCode: number };

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });
});

describe("forceCleanupAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    // Default: all paths exist
    client.mockImplementation(["fs", "exists"], (input: { path: string }) => ({
      exists: true,
      path: input.path,
    }));
    client.mockResponse(["fs", "rm"], { output: { removed: true } });
  });

  it("checks and removes node_modules", async () => {
    await executeAggregation(forceCleanupAggregation, { cwd: "/project" }, client);

    const existsCalls = client.getCallsFor(["fs", "exists"]);
    const nodeModulesCheck = existsCalls.find((c) =>
      (c.input as { path: string }).path.includes("node_modules")
    );
    expect(nodeModulesCheck).toBeDefined();

    const rmCalls = client.getCallsFor(["fs", "rm"]);
    const nodeModulesRm = rmCalls.find((c) =>
      (c.input as { path: string }).path.includes("node_modules")
    );
    expect(nodeModulesRm).toBeDefined();
  });

  it("checks and removes dist directory", async () => {
    await executeAggregation(forceCleanupAggregation, { cwd: "/project" }, client);

    const rmCalls = client.getCallsFor(["fs", "rm"]);
    const distRm = rmCalls.find((c) =>
      (c.input as { path: string }).path.includes("dist")
    );
    expect(distRm).toBeDefined();
  });

  it("checks and removes pnpm-lock.yaml", async () => {
    await executeAggregation(forceCleanupAggregation, { cwd: "/project" }, client);

    const rmCalls = client.getCallsFor(["fs", "rm"]);
    const lockRm = rmCalls.find((c) =>
      (c.input as { path: string }).path.includes("pnpm-lock.yaml")
    );
    expect(lockRm).toBeDefined();
  });

  it("checks and removes tsconfig.tsbuildinfo", async () => {
    await executeAggregation(forceCleanupAggregation, { cwd: "/project" }, client);

    const rmCalls = client.getCallsFor(["fs", "rm"]);
    const tsbuildRm = rmCalls.find((c) =>
      (c.input as { path: string }).path.includes("tsconfig.tsbuildinfo")
    );
    expect(tsbuildRm).toBeDefined();
  });

  it("skips removal when path does not exist", async () => {
    client.mockImplementation(["fs", "exists"], () => ({ exists: false }));

    await executeAggregation(forceCleanupAggregation, { cwd: "/project" }, client);

    const rmCalls = client.getCallsFor(["fs", "rm"]);
    expect(rmCalls).toHaveLength(0);
  });

  it("uses recursive: true for directories", async () => {
    await executeAggregation(forceCleanupAggregation, { cwd: "/project" }, client);

    const rmCalls = client.getCallsFor(["fs", "rm"]);
    const nodeModulesRm = rmCalls.find((c) =>
      (c.input as { path: string }).path.includes("node_modules")
    );
    expect((nodeModulesRm?.input as { recursive: boolean }).recursive).toBe(true);
  });

  it("handles removal errors gracefully", async () => {
    client.mockImplementation(["fs", "exists"], () => ({ exists: true }));
    client.mockResponse(["fs", "rm"], { error: new Error("Permission denied") });

    // Should not throw - tryCatch handles errors
    const result = await executeAggregation(
      forceCleanupAggregation,
      { cwd: "/project" },
      client
    );

    expect(result).toBeDefined();
  });

  it("returns cleanup summary", async () => {
    const result = await executeAggregation(
      forceCleanupAggregation,
      { cwd: "/project" },
      client
    ) as { success: boolean; cleaned: Record<string, unknown> };

    expect(result.success).toBe(true);
    expect(result.cleaned).toBeDefined();
  });
});

describe("ensureDirAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["fs", "exists"], { output: { exists: false } });
    client.mockResponse(["fs", "mkdir"], { output: { created: true } });
  });

  it("checks if directory exists", async () => {
    await executeAggregation(ensureDirAggregation, { path: "/new/dir" }, client);

    const existsCalls = client.getCallsFor(["fs", "exists"]);
    expect(existsCalls).toHaveLength(1);
    expect((existsCalls[0]?.input as { path: string }).path).toBe("/new/dir");
  });

  it("creates directory if it does not exist", async () => {
    client.mockResponse(["fs", "exists"], { output: { exists: false } });

    await executeAggregation(ensureDirAggregation, { path: "/new/dir" }, client);

    const mkdirCalls = client.getCallsFor(["fs", "mkdir"]);
    expect(mkdirCalls).toHaveLength(1);
    expect((mkdirCalls[0]?.input as { path: string }).path).toBe("/new/dir");
  });

  it("skips creation if directory already exists", async () => {
    client.mockResponse(["fs", "exists"], { output: { exists: true } });

    await executeAggregation(ensureDirAggregation, { path: "/existing/dir" }, client);

    const mkdirCalls = client.getCallsFor(["fs", "mkdir"]);
    expect(mkdirCalls).toHaveLength(0);
  });

  it("creates directory recursively", async () => {
    client.mockResponse(["fs", "exists"], { output: { exists: false } });

    await executeAggregation(ensureDirAggregation, { path: "/a/b/c/d" }, client);

    const mkdirCall = client.getCallsFor(["fs", "mkdir"])[0];
    expect((mkdirCall?.input as { recursive: boolean }).recursive).toBe(true);
  });

  it("returns success with created flag", async () => {
    client.mockResponse(["fs", "exists"], { output: { exists: false } });

    const result = await executeAggregation(
      ensureDirAggregation,
      { path: "/new/dir" },
      client
    ) as { success: boolean; path: string; created: boolean };

    expect(result.success).toBe(true);
    expect(result.path).toBe("/new/dir");
    expect(result.created).toBe(true);
  });

  it("returns created: false when directory existed", async () => {
    client.mockResponse(["fs", "exists"], { output: { exists: true } });

    const result = await executeAggregation(
      ensureDirAggregation,
      { path: "/existing" },
      client
    ) as { success: boolean; created: boolean };

    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
  });
});

describe("aggregation structure validation", () => {
  it("gitCommitAndPushAggregation has correct structure", () => {
    expect(gitCommitAndPushAggregation.$proc).toEqual(["client", "chain"]);
    expect(gitCommitAndPushAggregation.input).toBeDefined();
  });

  it("gitInitWorkflowAggregation has correct structure", () => {
    expect(gitInitWorkflowAggregation.$proc).toEqual(["client", "chain"]);
    expect(gitInitWorkflowAggregation.input).toBeDefined();
  });

  it("pnpmInstallAndBuildAggregation has correct structure", () => {
    expect(pnpmInstallAndBuildAggregation.$proc).toEqual(["client", "chain"]);
    expect(pnpmInstallAndBuildAggregation.input).toBeDefined();
  });

  it("forceCleanupAggregation has correct structure", () => {
    expect(forceCleanupAggregation.$proc).toEqual(["client", "chain"]);
    expect(forceCleanupAggregation.input).toBeDefined();
  });

  it("ensureDirAggregation has correct structure", () => {
    expect(ensureDirAggregation.$proc).toEqual(["client", "chain"]);
    expect(ensureDirAggregation.input).toBeDefined();
  });
});
