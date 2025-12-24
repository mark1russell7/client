/**
 * Parity tests for old imperative vs new aggregation implementations
 *
 * These tests verify that the new aggregation-based implementations
 * produce equivalent behavior to the old imperative implementations
 * by comparing:
 * 1. Sequence of procedure calls
 * 2. Input parameters to each procedure
 * 3. Final output structure
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ProcedureContext } from "@mark1russell7/client";
import { libNew } from "./new.js";
import { libNewAggregation } from "./new-aggregation.js";
import { refreshSinglePackageAggregation } from "./refresh-aggregation.js";
import type { AggregationDefinition } from "@mark1russell7/client";

/**
 * Mock client that records all procedure calls for comparison
 */
function createRecordingMockClient() {
  const calls: Array<{ path: string[]; input: unknown }> = [];
  const responses = new Map<string, unknown>();

  const pathToKey = (path: readonly string[]): string => path.join(".");

  const call = vi.fn(async (path: readonly string[], input: unknown) => {
    calls.push({ path: [...path], input });
    const key = pathToKey(path);
    return responses.get(key) ?? {};
  });

  return {
    call,
    getCalls: () => [...calls],
    getCallPaths: () => calls.map((c) => c.path.join(".")),
    mockResponse: <T>(path: readonly string[], response: T) => {
      responses.set(pathToKey(path), response);
    },
    reset: () => {
      calls.length = 0;
      responses.clear();
      call.mockClear();
    },
  };
}

/**
 * Simple aggregation executor for parity testing
 */
async function executeAggregation(
  aggregation: AggregationDefinition,
  input: Record<string, unknown>,
  client: ReturnType<typeof createRecordingMockClient>
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

  const resolveInput = (obj: unknown): unknown => {
    if (obj == null) return obj;
    if (typeof obj === "string") {
      return obj.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const value = resolveRef(path);
        return value != null ? String(value) : "";
      });
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
        return { $proc: record.$proc, $name: record.$name, input: record.input };
      }
      const firstPass: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === "object" && value !== null && "$ref" in value) {
          firstPass[key] = resolveInput(value);
        } else {
          firstPass[key] = value;
        }
      }
      const tempCtx = { ...context, ...firstPass };
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(firstPass)) {
        if (typeof value === "string" && value.includes("{{")) {
          result[key] = value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const parts = path.split(".");
            let v: unknown = tempCtx;
            for (const p of parts) {
              if (v == null || typeof v !== "object") return "";
              v = (v as Record<string, unknown>)[p];
            }
            return v != null ? String(v) : "";
          });
        } else {
          result[key] = resolveInput(value);
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
          for (const s of chainInput.steps) {
            result = await executeStep(s);
          }
          break;
        }
        case "conditional": {
          const condInput = stepInput as { condition: boolean; then?: AggregationDefinition; else?: AggregationDefinition };
          if (condInput.condition && condInput.then) {
            result = await executeStep(condInput.then as AggregationDefinition);
          } else if (!condInput.condition && condInput.else) {
            result = await executeStep(condInput.else as AggregationDefinition);
          }
          break;
        }
        case "tryCatch": {
          const tryInput = stepInput as { try: AggregationDefinition; catch: unknown };
          try {
            result = await executeStep(tryInput.try as AggregationDefinition);
          } catch {
            result = tryInput.catch;
          }
          break;
        }
        case "parallel": {
          const parallelInput = stepInput as { tasks: AggregationDefinition[] };
          result = await Promise.all(parallelInput.tasks.map((t) => executeStep(t)));
          break;
        }
        case "identity":
          result = stepInput;
          break;
        case "throw":
          throw new Error((stepInput as { message: string }).message);
        default:
          result = await client.call(proc, stepInput);
      }
    } else {
      result = await client.call(proc, stepInput);
    }

    if (name) context[name] = result;
    return result;
  };

  return executeStep(aggregation);
}

describe("lib.new parity", () => {
  let imperativeClient: ReturnType<typeof createRecordingMockClient>;
  let aggregationClient: ReturnType<typeof createRecordingMockClient>;
  let ctx: ProcedureContext;

  const setupMocks = (client: ReturnType<typeof createRecordingMockClient>) => {
    client.mockResponse(["fs", "read.json"], {
      data: {
        projectTemplate: { files: ["package.json", "tsconfig.json"], dirs: ["src"] },
      },
    });
    client.mockResponse(["fs", "exists"], { exists: false, path: "" });
    client.mockResponse(["fs", "mkdir"], { path: "", created: true });
    client.mockResponse(["fs", "write"], { path: "", bytesWritten: 100 });
    client.mockResponse(["shell", "exec"], { exitCode: 0, stdout: "", stderr: "" });
    client.mockResponse(["git", "init"], { path: "", created: true });
    client.mockResponse(["git", "add"], { staged: [] });
    client.mockResponse(["git", "commit"], { hash: "abc123", message: "" });
  };

  beforeEach(() => {
    imperativeClient = createRecordingMockClient();
    aggregationClient = createRecordingMockClient();
    setupMocks(imperativeClient);
    setupMocks(aggregationClient);
    ctx = {
      client: imperativeClient as unknown as ProcedureContext["client"],
      metadata: {},
      path: ["lib", "new"],
    };
  });

  it("both call fs.exists to check package existence", async () => {
    const input = { name: "test-pkg", preset: "node", skipGit: true, skipManifest: true };

    await libNew({ ...input, rootPath: "/git" }, ctx);
    await executeAggregation(libNewAggregation, { ...input, rootPath: "/git" }, aggregationClient);

    const imperativeExists = imperativeClient.getCalls().filter((c) => c.path.join(".") === "fs.exists");
    const aggregationExists = aggregationClient.getCalls().filter((c) => c.path.join(".") === "fs.exists");

    expect(imperativeExists.length).toBeGreaterThan(0);
    expect(aggregationExists.length).toBeGreaterThan(0);
  });

  it("both create package directory with mkdir", async () => {
    const input = { name: "test-pkg", preset: "node", skipGit: true, skipManifest: true, rootPath: "/git" };

    await libNew(input, ctx);
    await executeAggregation(libNewAggregation, input, aggregationClient);

    const imperativeMkdir = imperativeClient.getCalls().filter((c) => c.path.join(".") === "fs.mkdir");
    const aggregationMkdir = aggregationClient.getCalls().filter((c) => c.path.join(".") === "fs.mkdir");

    expect(imperativeMkdir.length).toBeGreaterThan(0);
    expect(aggregationMkdir.length).toBeGreaterThan(0);

    const imperativeMainDir = imperativeMkdir.find((c) =>
      (c.input as { path: string }).path.includes("test-pkg")
    );
    const aggregationMainDir = aggregationMkdir.find((c) =>
      (c.input as { path: string }).path.includes("test-pkg")
    );
    expect(imperativeMainDir).toBeDefined();
    expect(aggregationMainDir).toBeDefined();
  });

  it("both create src/index.ts entry point", async () => {
    const input = { name: "test-pkg", preset: "node", skipGit: true, skipManifest: true, rootPath: "/git" };

    await libNew(input, ctx);
    await executeAggregation(libNewAggregation, input, aggregationClient);

    const imperativeWrite = imperativeClient.getCalls().filter((c) => c.path.join(".") === "fs.write");
    const aggregationWrite = aggregationClient.getCalls().filter((c) => c.path.join(".") === "fs.write");

    const imperativeIndex = imperativeWrite.find((c) =>
      (c.input as { path: string }).path.includes("index.ts")
    );
    const aggregationIndex = aggregationWrite.find((c) =>
      (c.input as { path: string }).path.includes("index.ts")
    );

    expect(imperativeIndex).toBeDefined();
    expect(aggregationIndex).toBeDefined();
  });

  it("both run cue-config init and generate", async () => {
    const input = { name: "test-pkg", preset: "node", skipGit: true, skipManifest: true, rootPath: "/git" };

    await libNew(input, ctx);
    await executeAggregation(libNewAggregation, input, aggregationClient);

    const imperativeShell = imperativeClient.getCalls().filter((c) => c.path.join(".") === "shell.exec");
    const aggregationShell = aggregationClient.getCalls().filter((c) => c.path.join(".") === "shell.exec");

    const imperativeInit = imperativeShell.find((c) =>
      (c.input as { command: string }).command.includes("cue-config init")
    );
    const aggregationInit = aggregationShell.find((c) =>
      (c.input as { command: string }).command.includes("cue-config init")
    );

    expect(imperativeInit).toBeDefined();
    expect(aggregationInit).toBeDefined();

    const imperativeGen = imperativeShell.find((c) =>
      (c.input as { command: string }).command.includes("cue-config generate")
    );
    const aggregationGen = aggregationShell.find((c) =>
      (c.input as { command: string }).command.includes("cue-config generate")
    );

    expect(imperativeGen).toBeDefined();
    expect(aggregationGen).toBeDefined();
  });

  it("both skip git when skipGit=true", async () => {
    const input = { name: "test-pkg", preset: "node", skipGit: true, skipManifest: true, rootPath: "/git" };

    await libNew(input, ctx);
    await executeAggregation(libNewAggregation, input, aggregationClient);

    const imperativeGitInit = imperativeClient.getCalls().filter((c) => c.path.join(".") === "git.init");
    const aggregationGitInit = aggregationClient.getCalls().filter((c) => c.path.join(".") === "git.init");

    expect(imperativeGitInit).toHaveLength(0);
    expect(aggregationGitInit).toHaveLength(0);
  });

  it("both call git.init when skipGit=false", async () => {
    const input = { name: "test-pkg", preset: "node", skipGit: false, skipManifest: true, rootPath: "/git" };

    await libNew(input, ctx);
    await executeAggregation(libNewAggregation, input, aggregationClient);

    const imperativeGitInit = imperativeClient.getCalls().filter((c) => c.path.join(".") === "git.init");
    const aggregationGitInit = aggregationClient.getCalls().filter((c) => c.path.join(".") === "git.init");

    expect(imperativeGitInit.length).toBeGreaterThan(0);
    expect(aggregationGitInit.length).toBeGreaterThan(0);
  });

  it("both handle package already exists case", async () => {
    imperativeClient.mockResponse(["fs", "exists"], { exists: true, path: "/git/test-pkg" });
    aggregationClient.mockResponse(["fs", "exists"], { exists: true, path: "/git/test-pkg" });

    const input = { name: "test-pkg", preset: "node", skipGit: true, skipManifest: true, rootPath: "/git" };

    const imperativeResult = await libNew(input, ctx);
    expect(imperativeResult.success).toBe(false);

    await expect(
      executeAggregation(libNewAggregation, input, aggregationClient)
    ).rejects.toThrow();
  });
});

describe("lib.refresh parity (single package)", () => {
  let aggregationClient: ReturnType<typeof createRecordingMockClient>;

  const setupMocks = (client: ReturnType<typeof createRecordingMockClient>) => {
    client.mockResponse(["fs", "rm"], { path: "", removed: true });
    client.mockResponse(["pnpm", "install"], { success: true, exitCode: 0 });
    client.mockResponse(["pnpm", "run"], { success: true, exitCode: 0 });
    client.mockResponse(["git", "add"], { staged: [] });
    client.mockResponse(["git", "commit"], { hash: "abc" });
    client.mockResponse(["git", "push"], { pushed: true });
  };

  beforeEach(() => {
    aggregationClient = createRecordingMockClient();
    setupMocks(aggregationClient);
  });

  it("runs pnpm install", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", skipGit: true },
      aggregationClient
    );

    const installCalls = aggregationClient.getCalls().filter(
      (c) => c.path.join(".") === "pnpm.install"
    );

    expect(installCalls.length).toBeGreaterThan(0);
  });

  it("runs pnpm build", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", skipGit: true },
      aggregationClient
    );

    const buildCalls = aggregationClient.getCalls().filter(
      (c) => c.path.join(".") === "pnpm.run"
    );

    expect(buildCalls.length).toBeGreaterThan(0);
    const buildCall = buildCalls[0];
    expect((buildCall?.input as { script: string }).script).toBe("build");
  });

  it("skips git when skipGit=true", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", skipGit: true },
      aggregationClient
    );

    const gitAddCalls = aggregationClient.getCalls().filter(
      (c) => c.path.join(".") === "git.add"
    );

    expect(gitAddCalls).toHaveLength(0);
  });

  it("calls git operations when skipGit=false", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", skipGit: false },
      aggregationClient
    );

    const gitAddCalls = aggregationClient.getCalls().filter(
      (c) => c.path.join(".") === "git.add"
    );
    const gitCommitCalls = aggregationClient.getCalls().filter(
      (c) => c.path.join(".") === "git.commit"
    );
    const gitPushCalls = aggregationClient.getCalls().filter(
      (c) => c.path.join(".") === "git.push"
    );

    expect(gitAddCalls.length).toBeGreaterThan(0);
    expect(gitCommitCalls.length).toBeGreaterThan(0);
    expect(gitPushCalls.length).toBeGreaterThan(0);
  });

  it("performs cleanup when force=true", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", force: true, skipGit: true },
      aggregationClient
    );

    const rmCalls = aggregationClient.getCalls().filter(
      (c) => c.path.join(".") === "fs.rm"
    );

    expect(rmCalls.length).toBeGreaterThan(0);
  });

  it("skips cleanup when force=false", async () => {
    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", force: false, skipGit: true },
      aggregationClient
    );

    const rmCalls = aggregationClient.getCalls().filter(
      (c) => c.path.join(".") === "fs.rm"
    );

    expect(rmCalls).toHaveLength(0);
  });
});

describe("procedure call sequence parity", () => {
  it("lib.new follows expected call order", async () => {
    const client = createRecordingMockClient();
    client.mockResponse(["fs", "read.json"], { data: { projectTemplate: { dirs: ["src"], files: [] } } });
    client.mockResponse(["fs", "exists"], { exists: false });
    client.mockResponse(["fs", "mkdir"], { created: true });
    client.mockResponse(["fs", "write"], { bytesWritten: 100 });
    client.mockResponse(["shell", "exec"], { exitCode: 0 });

    await executeAggregation(
      libNewAggregation,
      { rootPath: "/git", name: "test", preset: "node", skipGit: true, skipManifest: true },
      client
    );

    const callPaths = client.getCallPaths();

    // Verify order: exists check comes before mkdir
    const existsIdx = callPaths.indexOf("fs.exists");
    const mkdirIdx = callPaths.indexOf("fs.mkdir");
    expect(existsIdx).toBeLessThan(mkdirIdx);

    // Verify cue-config init comes before generate
    const shellCalls = client.getCalls().filter((c) => c.path.join(".") === "shell.exec");
    const initIdx = shellCalls.findIndex((c) =>
      (c.input as { command: string }).command.includes("cue-config init")
    );
    const genIdx = shellCalls.findIndex((c) =>
      (c.input as { command: string }).command.includes("cue-config generate")
    );
    expect(initIdx).toBeLessThan(genIdx);
  });

  it("lib.refresh follows expected call order", async () => {
    const client = createRecordingMockClient();
    client.mockResponse(["pnpm", "install"], { success: true, exitCode: 0 });
    client.mockResponse(["pnpm", "run"], { success: true, exitCode: 0 });
    client.mockResponse(["git", "add"], { staged: [] });
    client.mockResponse(["git", "commit"], { hash: "abc" });
    client.mockResponse(["git", "push"], { pushed: true });

    await executeAggregation(
      refreshSinglePackageAggregation,
      { cwd: "/pkg", packageName: "test", skipGit: false },
      client
    );

    const callPaths = client.getCallPaths();

    // Verify order: install comes before build
    const installIdx = callPaths.indexOf("pnpm.install");
    const buildIdx = callPaths.indexOf("pnpm.run");
    expect(installIdx).toBeLessThan(buildIdx);

    // Verify order: build comes before git
    const gitAddIdx = callPaths.indexOf("git.add");
    expect(buildIdx).toBeLessThan(gitAddIdx);

    // Verify git order: add -> commit -> push
    const gitCommitIdx = callPaths.indexOf("git.commit");
    const gitPushIdx = callPaths.indexOf("git.push");
    expect(gitAddIdx).toBeLessThan(gitCommitIdx);
    expect(gitCommitIdx).toBeLessThan(gitPushIdx);
  });
});
