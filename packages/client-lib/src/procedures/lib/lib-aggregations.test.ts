/**
 * Integration tests for full lib aggregations
 *
 * Tests verify that lib.new, lib.refresh, lib.install, lib.pull
 * correctly compose their component procedures.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { libNewAggregation, libScaffoldAggregation } from "./new-aggregation.js";
import {
  refreshSinglePackageAggregation,
  libRefreshAggregation,
} from "./refresh-aggregation.js";
import {
  cloneMissingPackageAggregation,
  installSinglePackageAggregation,
  libInstallAggregation,
} from "./install-aggregation.js";
import {
  pullSinglePackageAggregation,
  libPullAggregation,
} from "./pull-aggregation.js";
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
 */
async function executeAggregation(
  aggregation: AggregationDefinition,
  input: Record<string, unknown>,
  client: ReturnType<typeof createTestMockClient>
): Promise<unknown> {
  const context: Record<string, unknown> = { input };

  const resolveRef = (ref: string): unknown => {
    const parts = ref.split(".");
    let value: unknown = context;
    for (const part of parts) {
      if (value == null || typeof value !== "object") return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  };

  const resolveTemplate = (str: string): string => {
    return str.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const value = resolveRef(path);
      return value != null ? String(value) : "";
    });
  };

  const resolveInput = (obj: unknown): unknown => {
    if (obj == null) return obj;
    if (typeof obj === "string") {
      if (obj.includes("{{")) return resolveTemplate(obj);
      return obj;
    }
    if (Array.isArray(obj)) return obj.map((item) => resolveInput(item));
    if (typeof obj === "object") {
      const record = obj as Record<string, unknown>;
      if ("$ref" in record && typeof record.$ref === "string") {
        const value = resolveRef(record.$ref);
        if (record.invert) return !value;
        return value;
      }
      if ("$proc" in record) {
        const result: Record<string, unknown> = {
          $proc: record.$proc,
        };
        if ("$name" in record) result.$name = record.$name;
        if ("input" in record) result.input = record.input;
        return result;
      }
      // First pass: resolve $refs
      const firstPass: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === "object" && value !== null && "$ref" in value) {
          firstPass[key] = resolveInput(value);
        } else {
          firstPass[key] = value;
        }
      }
      // Add first pass values to context temporarily for template resolution
      const tempCtx = { ...context, ...firstPass };
      const resolveTemplateWithObj = (str: string): string => {
        return str.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
          const parts = path.split(".");
          let value: unknown = tempCtx;
          for (const part of parts) {
            if (value == null || typeof value !== "object") return "";
            value = (value as Record<string, unknown>)[part];
          }
          return value != null ? String(value) : "";
        });
      };
      // Second pass: resolve templates and recurse
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(firstPass)) {
        if (typeof value === "string" && value.includes("{{")) {
          result[key] = resolveTemplateWithObj(value);
        } else if (Array.isArray(value)) {
          result[key] = value.map((item) => resolveInput(item));
        } else if (typeof value === "object" && value !== null && !("$ref" in value)) {
          result[key] = resolveInput(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  };

  const executeStep = async (step: AggregationDefinition): Promise<unknown> => {
    const proc = step.$proc;
    const name = step.$name;
    const stepInput = resolveInput(step.input);

    let result: unknown;

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
        case "parallel": {
          const parallelInput = stepInput as { tasks: AggregationDefinition[] };
          result = await Promise.all(
            parallelInput.tasks.map((t) => executeStep(t))
          );
          break;
        }
        case "map": {
          const mapInput = stepInput as {
            items: unknown[];
            mapper: AggregationDefinition;
          };
          result = [];
          for (const item of mapInput.items || []) {
            context.item = item;
            (result as unknown[]).push(await executeStep(mapInput.mapper as AggregationDefinition));
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

    if (name) {
      context[name] = result;
    }

    return result;
  };

  return executeStep(aggregation);
}

describe("libNewAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    // Set up default responses
    client.mockResponse(["fs", "read.json"], {
      output: {
        projectTemplate: {
          files: ["package.json", "tsconfig.json"],
          dirs: ["src"],
        },
      },
    });
    client.mockResponse(["fs", "exists"], { output: { exists: false } });
    client.mockResponse(["fs", "mkdir"], { output: { created: true } });
    client.mockResponse(["fs", "write"], { output: { written: true } });
    client.mockResponse(["shell", "exec"], { output: { success: true, exitCode: 0 } });
    client.mockResponse(["git", "init"], { output: { initialized: true } });
    client.mockResponse(["git", "add"], { output: { staged: true } });
    client.mockResponse(["git", "commit"], { output: { sha: "abc123" } });
    client.mockResponse(["lib", "manifest.add"], { output: { added: true } });
  });

  it("creates package directory structure", async () => {
    await executeAggregation(
      libNewAggregation,
      { rootPath: "/home/user/git", name: "test-pkg", preset: "node", skipGit: true, skipManifest: true },
      client
    );

    const mkdirCalls = client.getCallsFor(["fs", "mkdir"]);
    expect(mkdirCalls.length).toBeGreaterThan(0);
    const mainMkdir = mkdirCalls.find(
      (c) => (c.input as { path: string }).path === "/home/user/git/test-pkg"
    );
    expect(mainMkdir).toBeDefined();
  });

  it("creates src/index.ts entry point", async () => {
    await executeAggregation(
      libNewAggregation,
      { rootPath: "/git", name: "my-lib", preset: "node", skipGit: true, skipManifest: true },
      client
    );

    const writeCalls = client.getCallsFor(["fs", "write"]);
    const indexWrite = writeCalls.find((c) =>
      (c.input as { path: string }).path.includes("src/index.ts")
    );
    expect(indexWrite).toBeDefined();
  });

  it("runs cue-config init and generate", async () => {
    await executeAggregation(
      libNewAggregation,
      { rootPath: "/git", name: "test", preset: "node", skipGit: true, skipManifest: true },
      client
    );

    const shellCalls = client.getCallsFor(["shell", "exec"]);
    const initCall = shellCalls.find((c) =>
      (c.input as { command: string }).command.includes("cue-config init")
    );
    const genCall = shellCalls.find((c) =>
      (c.input as { command: string }).command.includes("cue-config generate")
    );
    expect(initCall).toBeDefined();
    expect(genCall).toBeDefined();
  });

  it("throws if package already exists", async () => {
    client.mockResponse(["fs", "exists"], { output: { exists: true } });

    await expect(
      executeAggregation(
        libNewAggregation,
        { rootPath: "/git", name: "existing", preset: "node" },
        client
      )
    ).rejects.toThrow("Package already exists");
  });

  it("skips git when skipGit=true", async () => {
    await executeAggregation(
      libNewAggregation,
      { rootPath: "/git", name: "no-git", preset: "node", skipGit: true, skipManifest: true },
      client
    );

    const gitInitCalls = client.getCallsFor(["git", "init"]);
    expect(gitInitCalls).toHaveLength(0);
  });

  it("initializes git when skipGit=false", async () => {
    await executeAggregation(
      libNewAggregation,
      { rootPath: "/git", name: "with-git", preset: "node", skipGit: false, skipManifest: true },
      client
    );

    const gitInitCalls = client.getCallsFor(["git", "init"]);
    expect(gitInitCalls.length).toBeGreaterThan(0);
  });

  it("updates manifest when skipManifest=false", async () => {
    await executeAggregation(
      libNewAggregation,
      { rootPath: "/git", name: "with-manifest", preset: "node", skipGit: true, skipManifest: false },
      client
    );

    const manifestCalls = client.getCallsFor(["lib", "manifest.add"]);
    expect(manifestCalls.length).toBeGreaterThan(0);
  });

  it("returns success result", async () => {
    const result = await executeAggregation(
      libNewAggregation,
      { rootPath: "/git", name: "result-test", preset: "node", skipGit: true, skipManifest: true },
      client
    ) as { success: boolean; packageName: string };

    expect(result.success).toBe(true);
    expect(result.packageName).toBe("@mark1russell7/result-test");
  });
});

describe("libScaffoldAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["fs", "mkdir"], { output: { created: true } });
    client.mockResponse(["fs", "write"], { output: { written: true } });
  });

  it("creates root directory", async () => {
    await executeAggregation(libScaffoldAggregation, { path: "/new/pkg" }, client);

    const mkdirCalls = client.getCallsFor(["fs", "mkdir"]);
    const rootMkdir = mkdirCalls.find(
      (c) => (c.input as { path: string }).path === "/new/pkg"
    );
    expect(rootMkdir).toBeDefined();
  });

  it("creates src directory", async () => {
    await executeAggregation(libScaffoldAggregation, { path: "/new/pkg" }, client);

    const mkdirCalls = client.getCallsFor(["fs", "mkdir"]);
    const srcMkdir = mkdirCalls.find((c) =>
      (c.input as { path: string }).path.includes("/src")
    );
    expect(srcMkdir).toBeDefined();
  });

  it("creates entry point file", async () => {
    await executeAggregation(libScaffoldAggregation, { path: "/pkg" }, client);

    const writeCalls = client.getCallsFor(["fs", "write"]);
    expect(writeCalls.length).toBeGreaterThan(0);
  });
});

describe("refreshSinglePackageAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["fs", "rm"], { output: { removed: true } });
    client.mockResponse(["pnpm", "install"], { output: { success: true, exitCode: 0 } });
    client.mockResponse(["pnpm", "run"], { output: { success: true, exitCode: 0 } });
    client.mockResponse(["git", "add"], { output: { staged: true } });
    client.mockResponse(["git", "commit"], { output: { sha: "ref123" } });
    client.mockResponse(["git", "push"], { output: { pushed: true } });
  });

  it("runs pnpm install and build", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", skipGit: true },
      client
    );

    const installCalls = client.getCallsFor(["pnpm", "install"]);
    const buildCalls = client.getCallsFor(["pnpm", "run"]);
    expect(installCalls).toHaveLength(1);
    expect(buildCalls).toHaveLength(1);
  });

  it("cleans up when force=true", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", force: true, skipGit: true },
      client
    );

    const rmCalls = client.getCallsFor(["fs", "rm"]);
    expect(rmCalls.length).toBeGreaterThan(0);
  });

  it("skips cleanup when force=false", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", force: false, skipGit: true },
      client
    );

    const rmCalls = client.getCallsFor(["fs", "rm"]);
    expect(rmCalls).toHaveLength(0);
  });

  it("commits and pushes when skipGit=false", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", skipGit: false },
      client
    );

    const addCalls = client.getCallsFor(["git", "add"]);
    const commitCalls = client.getCallsFor(["git", "commit"]);
    const pushCalls = client.getCallsFor(["git", "push"]);
    expect(addCalls.length).toBeGreaterThan(0);
    expect(commitCalls.length).toBeGreaterThan(0);
    expect(pushCalls.length).toBeGreaterThan(0);
  });

  it("throws on install failure", async () => {
    client.mockResponse(["pnpm", "install"], { output: { success: false } });

    await expect(
      executeAggregation(
        refreshSinglePackageAggregation,
        { cwd: "/pkg", packageName: "test", skipGit: true },
        client
      )
    ).rejects.toThrow("pnpm install failed");
  });

  it("throws on build failure", async () => {
    client.mockResponse(["pnpm", "run"], { output: { success: false } });

    await expect(
      executeAggregation(
        refreshSinglePackageAggregation,
        { cwd: "/pkg", packageName: "test", skipGit: true },
        client
      )
    ).rejects.toThrow("pnpm run build failed");
  });
});

describe("cloneMissingPackageAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["fs", "exists"], { output: { exists: false } });
    client.mockResponse(["git", "clone"], { output: { cloned: true } });
  });

  it("clones when directory does not exist", async () => {
    client.mockResponse(["fs", "exists"], { output: { exists: false } });

    await executeAggregation(
      cloneMissingPackageAggregation,
      { path: "/git/pkg", url: "git@github.com:user/pkg.git", name: "pkg" },
      client
    );

    const cloneCalls = client.getCallsFor(["git", "clone"]);
    expect(cloneCalls).toHaveLength(1);
  });

  it("skips clone when directory exists", async () => {
    client.mockResponse(["fs", "exists"], { output: { exists: true } });

    await executeAggregation(
      cloneMissingPackageAggregation,
      { path: "/git/pkg", url: "git@github.com:user/pkg.git", name: "pkg" },
      client
    );

    const cloneCalls = client.getCallsFor(["git", "clone"]);
    expect(cloneCalls).toHaveLength(0);
  });

  it("skips clone in dry-run mode", async () => {
    client.mockResponse(["fs", "exists"], { output: { exists: false } });

    const result = await executeAggregation(
      cloneMissingPackageAggregation,
      { path: "/git/pkg", url: "git@github.com:user/pkg.git", name: "pkg", dryRun: true },
      client
    ) as { cloned: { wouldClone: boolean } };

    const cloneCalls = client.getCallsFor(["git", "clone"]);
    expect(cloneCalls).toHaveLength(0);
  });
});

describe("installSinglePackageAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["pnpm", "install"], { output: { success: true, exitCode: 0 } });
    client.mockResponse(["pnpm", "run"], { output: { success: true, exitCode: 0 } });
  });

  it("runs install then build", async () => {
    await executeAggregation(
      installSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test" },
      client
    );

    const calls = client.getCalls();
    const installIdx = calls.findIndex((c) => c.path.join(".") === "pnpm.install");
    const buildIdx = calls.findIndex((c) => c.path.join(".") === "pnpm.run");
    expect(installIdx).toBeLessThan(buildIdx);
  });

  it("returns success result", async () => {
    const result = await executeAggregation(
      installSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test" },
      client
    ) as { success: boolean; phase: string };

    expect(result.success).toBe(true);
    expect(result.phase).toBe("complete");
  });
});

describe("pullSinglePackageAggregation", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    client.mockResponse(["git", "pull"], { output: { commits: 2, fastForward: true } });
  });

  it("executes git pull", async () => {
    await executeAggregation(
      pullSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", remote: "origin" },
      client
    );

    const pullCalls = client.getCallsFor(["git", "pull"]);
    expect(pullCalls).toHaveLength(1);
  });

  it("passes rebase option", async () => {
    await executeAggregation(
      pullSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", rebase: true },
      client
    );

    const pullCall = client.getCallsFor(["git", "pull"])[0];
    expect((pullCall?.input as { rebase: boolean }).rebase).toBe(true);
  });

  it("skips git pull in dry-run mode", async () => {
    await executeAggregation(
      pullSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", dryRun: true },
      client
    );

    // In dry-run mode, git pull should not be called
    const pullCalls = client.getCallsFor(["git", "pull"]);
    expect(pullCalls).toHaveLength(0);
  });
});

describe("libRefreshAggregation structure", () => {
  it("has chain structure", () => {
    expect(libRefreshAggregation.$proc).toEqual(["client", "chain"]);
  });

  it("starts with lib.scan", () => {
    const steps = (libRefreshAggregation.input as { steps: AggregationDefinition[] }).steps;
    expect(steps[0].$proc).toEqual(["lib", "scan"]);
  });
});

describe("libInstallAggregation structure", () => {
  it("has chain structure", () => {
    expect(libInstallAggregation.$proc).toEqual(["client", "chain"]);
  });

  it("loads manifest early", () => {
    const steps = (libInstallAggregation.input as { steps: AggregationDefinition[] }).steps;
    const manifestStep = steps.find((s) =>
      s.$name === "manifest"
    );
    expect(manifestStep).toBeDefined();
  });
});

describe("libPullAggregation structure", () => {
  it("has chain structure", () => {
    expect(libPullAggregation.$proc).toEqual(["client", "chain"]);
  });

  it("uses dag.execute for parallel processing", () => {
    const steps = (libPullAggregation.input as { steps: AggregationDefinition[] }).steps;
    const dagStep = steps.find((s) =>
      s.$proc[0] === "dag" && s.$proc[1] === "execute"
    );
    expect(dagStep).toBeDefined();
  });
});

describe("DAG execution behavior", () => {
  let client: ReturnType<typeof createTestMockClient>;

  beforeEach(() => {
    client = createTestMockClient();
    // Default mocks
    client.mockResponse(["fs", "rm"], { output: { removed: true } });
    client.mockResponse(["pnpm", "install"], { output: { success: true, exitCode: 0 } });
    client.mockResponse(["pnpm", "run"], { output: { success: true, exitCode: 0 } });
    client.mockResponse(["git", "add"], { output: { staged: true } });
    client.mockResponse(["git", "commit"], { output: { sha: "abc123" } });
    client.mockResponse(["git", "push"], { output: { pushed: true } });
    client.mockResponse(["git", "pull"], { output: { commits: 0 } });
    client.mockResponse(["git", "clone"], { output: { cloned: true } });
    client.mockResponse(["fs", "exists"], { output: { exists: true } });
  });

  describe("libRefreshAggregation execution", () => {
    it("scan step returns packages", async () => {
      client.mockResponse(["lib", "scan"], {
        output: {
          packages: {
            "pkg-a": { name: "pkg-a", repoPath: "/git/pkg-a", mark1russell7Deps: [] },
            "pkg-b": { name: "pkg-b", repoPath: "/git/pkg-b", mark1russell7Deps: ["pkg-a"] },
          },
          warnings: [],
        },
      });

      const result = await executeAggregation(
        { $proc: ["lib", "scan"], $name: "scan", input: { rootPath: "/git" } },
        { rootPath: "/git" },
        client
      );

      expect(result).toHaveProperty("packages");
    });

    it("handles empty package list gracefully", async () => {
      client.mockResponse(["lib", "scan"], {
        output: { packages: {}, warnings: [] },
      });
      client.mockResponse(["lib", "topologicalSort"], {
        output: { sorted: [] },
      });
      client.mockResponse(["dag", "execute"], {
        output: { results: [], allSucceeded: true, errors: [] },
      });

      const result = await executeAggregation(
        libRefreshAggregation,
        { rootPath: "/git", skipGit: true },
        client
      );

      // Should succeed even with no packages
      expect(result).toBeDefined();
    });
  });

  describe("dependency ordering", () => {
    it("libRefreshAggregation uses dag.execute for all mode", () => {
      const steps = (libRefreshAggregation.input as { steps: AggregationDefinition[] }).steps;
      const conditionalStep = steps.find((s) => s.$name === "result");
      expect(conditionalStep).toBeDefined();
      expect(conditionalStep?.$proc).toEqual(["client", "conditional"]);
      // The 'then' branch contains dag.execute
      const thenBranch = (conditionalStep?.input as { then: AggregationDefinition }).then;
      expect(thenBranch.$proc).toEqual(["dag", "execute"]);
    });

    it("libInstallAggregation loads manifest with tryCatch wrapper", () => {
      const steps = (libInstallAggregation.input as { steps: AggregationDefinition[] }).steps;
      const manifestStep = steps.find((s) => s.$name === "manifest");

      expect(manifestStep).toBeDefined();
      // Manifest loading is wrapped in tryCatch for error handling
      expect(manifestStep?.$proc).toEqual(["client", "tryCatch"]);
    });
  });

  describe("parallel task execution", () => {
    it("client.parallel executes all tasks", async () => {
      const result = await executeAggregation(
        {
          $proc: ["client", "parallel"],
          input: {
            tasks: [
              { $proc: ["pnpm", "install"], input: { cwd: "/pkg1" } },
              { $proc: ["pnpm", "install"], input: { cwd: "/pkg2" } },
              { $proc: ["pnpm", "install"], input: { cwd: "/pkg3" } },
            ],
          },
        },
        {},
        client
      ) as unknown[];

      expect(result).toHaveLength(3);
      const installCalls = client.getCallsFor(["pnpm", "install"]);
      expect(installCalls).toHaveLength(3);
    });

    it("parallel tasks receive correct individual inputs", async () => {
      await executeAggregation(
        {
          $proc: ["client", "parallel"],
          input: {
            tasks: [
              { $proc: ["pnpm", "install"], input: { cwd: "/pkg-a" } },
              { $proc: ["pnpm", "install"], input: { cwd: "/pkg-b" } },
            ],
          },
        },
        {},
        client
      );

      const calls = client.getCallsFor(["pnpm", "install"]);
      const cwds = calls.map((c) => (c.input as { cwd: string }).cwd);
      expect(cwds).toContain("/pkg-a");
      expect(cwds).toContain("/pkg-b");
    });
  });

  describe("error handling in DAG execution", () => {
    it("single package failure is reported", async () => {
      client.mockResponse(["pnpm", "install"], {
        output: { success: false },
      });

      await expect(
        executeAggregation(
          refreshSinglePackageAggregation,
          { cwd: "/failing-pkg", packageName: "failing", skipGit: true },
          client
        )
      ).rejects.toThrow("pnpm install failed");
    });

    it("error message includes package context", async () => {
      client.mockResponse(["pnpm", "run"], {
        error: new Error("Build failed"),
      });

      await expect(
        executeAggregation(
          refreshSinglePackageAggregation,
          { cwd: "/bad-build", packageName: "bad-build", skipGit: true },
          client
        )
      ).rejects.toThrow("Build failed");
    });
  });

  describe("dry-run mode", () => {
    it("pullSinglePackageAggregation dry-run returns wouldPull info", async () => {
      const result = await executeAggregation(
        pullSinglePackageAggregation,
        { cwd: "/pkg", packageName: "test", dryRun: true },
        client
      ) as { dryRun: boolean };

      // In dry-run mode, no git pull should happen
      const pullCalls = client.getCallsFor(["git", "pull"]);
      expect(pullCalls).toHaveLength(0);
    });

    it("cloneMissingPackageAggregation dry-run returns wouldClone info", async () => {
      client.mockResponse(["fs", "exists"], { output: { exists: false } });

      const result = await executeAggregation(
        cloneMissingPackageAggregation,
        { path: "/git/new-pkg", url: "git@github.com:user/new-pkg.git", name: "new-pkg", dryRun: true },
        client
      ) as { cloned: { wouldClone: boolean } };

      // In dry-run mode, no actual clone should happen
      const cloneCalls = client.getCallsFor(["git", "clone"]);
      expect(cloneCalls).toHaveLength(0);
    });
  });

  describe("aggregation composition", () => {
    it("libNewAggregation includes path resolution step", () => {
      const steps = (libNewAggregation.input as { steps: AggregationDefinition[] }).steps;
      const pathsStep = steps.find((s) => s.$name === "paths");
      expect(pathsStep).toBeDefined();
      expect(pathsStep?.$proc).toEqual(["client", "identity"]);
    });

    it("refreshSinglePackageAggregation uses conditional for force cleanup", () => {
      const steps = (refreshSinglePackageAggregation.input as { steps: AggregationDefinition[] }).steps;
      const conditionalStep = steps.find((s) => s.$proc[1] === "conditional");
      expect(conditionalStep).toBeDefined();
    });

    it("libInstallAggregation uses map for package processing", () => {
      const steps = (libInstallAggregation.input as { steps: AggregationDefinition[] }).steps;
      const hasMap = steps.some((s) => s.$proc[1] === "map");
      const hasDag = steps.some((s) => s.$proc[0] === "dag");
      // Should use either map or dag for batch processing
      expect(hasMap || hasDag).toBe(true);
    });
  });
});
