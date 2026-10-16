/**
 * The nested calls of the dev-tools MCP tools (deep dive MCP-3).
 *
 * The server sets `strictCalls`: a tool of code can call a procedure that is not a tool only when
 * its `metadata.calls` names it. These tests keep the declarations true and the reach visible:
 *
 * 1. Each tool of code runs here, in this process, with a sample input. An interceptor records
 *    each nested call and answers it with a fake, so no nested procedure runs (no docker, no
 *    file writes). Each recorded call to a procedure that is not a tool must be declared. The
 *    test runs each tool twice: once with `fs.exists` true and once false, to reach both paths.
 * 2. `reachable.snapshot.txt` pins the procedures that are not tools but that the tools can reach
 *    through their declarations. `shell.exec` (a shell string) and `cli.run` must never be there.
 *
 * A new tool needs a sample input in SAMPLES. If you change the reach on purpose, update
 * reachable.snapshot.txt: copy the "received" list from the failure message.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROCEDURE_REGISTRY,
  callMatches,
  declaredCalls,
  hiddenReach,
  invokeProcedure,
  isDataDriven,
  outputValue,
  pathToKey,
  type Interceptor,
  type ProcedureOutput,
} from "@procedures/client";
import { exposeRule, mergeSurfaces } from "@procedures/mcp-server";
import * as bundle from "@procedures/bundle-mcp/register.js";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// A closed port and a short timeout: the mongo tools fail at once, with no server
process.env["MONGODB_URI"] = "mongodb://127.0.0.1:9/?serverSelectionTimeoutMS=200&connectTimeoutMS=200";

const surface = mergeSurfaces([bundle]);
const expose = exposeRule(surface!);

let tmp: string;
let workspace: string;

/** The sample input of each tool of code. A data-driven tool (client.*) calls only tools. */
function samples(): Record<string, unknown> {
  const db = join(tmp, "calls.db");
  const cwd = { cwd: tmp };
  return {
    // The core procedures that are not control flow: they make no nested call
    "client.all": { values: [true, true] },
    "client.any": { values: [false, true] },
    "client.constant": { value: 1 },
    "client.identity": { value: 1 },
    "client.none": { values: [false] },
    "client.not": { value: false },
    "client.throw": { message: "calls test" },
    "cue.add": { feature: "node", ...cwd },
    "cue.generate": cwd,
    "cue.init": { force: true, ...cwd },
    "cue.remove": { feature: "node", ...cwd },
    "cue.validate": cwd,
    "db.execute": { dbPath: db, sql: "CREATE TABLE IF NOT EXISTS t (x INTEGER)" },
    "db.query": { dbPath: db, sql: "SELECT 1 AS one" },
    "docker.build": { context: ".", tag: "calls-test:0", ...cwd },
    "docker.compose.down": cwd,
    "docker.compose.up": cwd,
    "docker.exec": { container: "calls-test-none", command: "true" },
    "docker.logs": { container: "calls-test-none" },
    // A second input of the same tool after "#": with follow, docker.logs streams through shell.stream
    "docker.logs#follow": { container: "calls-test-none", follow: true },
    "docker.ps": {},
    "docker.pull": { image: "calls-test-none" },
    "docker.rm": { containers: ["calls-test-none"] },
    "docker.run": { image: "calls-test-none" },
    "docker.stop": { containers: ["calls-test-none"] },
    "lib.audit": { rootPath: workspace },
    "lib.new": { name: "calls-test", rootPath: workspace },
    "lib.rename": { oldName: "@mark1russell7/calls-a", newName: "@mark1russell7/calls-b", rootPath: workspace },
    "lib.scan": { rootPath: workspace },
    "logs.query": { dbPath: db },
    "logs.store": { dbPath: db, level: "info", message: "calls test" },
    "mongo.collections.create": { collection: "c" },
    "mongo.collections.drop": { collection: "c" },
    "mongo.collections.list": {},
    "mongo.collections.stats": { collection: "c" },
    "mongo.database.info": {},
    "mongo.database.ping": {},
    "mongo.documents.aggregate": { collection: "c", pipeline: [] },
    "mongo.documents.count": { collection: "c" },
    "mongo.documents.delete": { collection: "c", id: "000000000000000000000000" },
    "mongo.documents.find": { collection: "c" },
    "mongo.documents.get": { collection: "c", id: "000000000000000000000000" },
    "mongo.documents.insert": { collection: "c", document: { a: 1 } },
    "mongo.documents.update": { collection: "c", id: "000000000000000000000000", update: { $set: { a: 2 } } },
    "mongo.indexes.create": { collection: "c", keys: { a: 1 } },
    "mongo.indexes.drop": { collection: "c", name: "a_1" },
    "mongo.indexes.list": { collection: "c" },
    "procedure.define": { path: ["callstest", "defined"], aggregation: { $proc: ["client", "identity"], input: { value: 1 } } },
    "procedure.delete": { path: ["callstest", "defined"] },
    "procedure.export": { path: ["client", "identity"] },
    "procedure.get": { path: ["client", "identity"] },
    "procedure.manifest": { namespace: "client" },
    "procedure.list": {},
    "procedure.new": { name: "callsTest", path: join(workspace, "packages", "calls-a") },
    "vitest.coverage": cwd,
    "vitest.run": cwd,
  };
}

/** The fake answer of a nested call. `exists` chooses the answer of fs.exists. */
function fake(key: string, input: { path?: string } | undefined, exists: boolean): unknown {
  const path = input?.path ?? "";
  switch (key) {
    case "fs.exists":
      return exists ? { exists: true, stats: { size: 0, isFile: true, isDirectory: false } } : { exists: false };
    case "fs.read":
      return { path, content: '{"dependencies":["ts"]}', stats: { size: 22 } };
    case "fs.read.json":
      return { path, data: { name: "@mark1russell7/calls-a", version: "0.0.0", dependencies: {} } };
    case "fs.readdir":
      return { path, entries: [{ name: "calls-a", type: "directory" }] };
    case "fs.glob":
      return { matches: [] };
    case "fs.write":
      return { path, bytesWritten: 0 };
    case "fs.mkdir":
      return { path, created: true };
    case "shell.run":
      return { exitCode: 0, stdout: "", stderr: "", duration: 0 };
    case "git.status":
      return { branch: "main", ahead: 0, behind: 0, files: [], clean: true };
    case "git.remote":
      return { name: "origin", url: "https://example.invalid/calls.git" };
    default:
      return {};
  }
}

/** The nested calls that the tools made: "caller -> callee". */
async function recordNestedCalls(): Promise<Set<string>> {
  const edges = new Set<string>();
  const inputs = samples();
  for (const exists of [true, false]) {
    const recorder: Interceptor = async (invocation, next): Promise<ProcedureOutput<unknown>> => {
      if (invocation.depth === 0) return next();
      const from = invocation.parent ? pathToKey(invocation.parent.path) : "?";
      const to = pathToKey(invocation.path);
      edges.add(`${from} -> ${to}`);
      return { kind: "value", value: fake(to, invocation.input as { path?: string }, exists) };
    };
    for (const key of Object.keys(inputs).sort()) {
      const procedure = PROCEDURE_REGISTRY.get(key.split("#")[0]!.split("."));
      if (!procedure) continue;
      try {
        await outputValue(await invokeProcedure(procedure, inputs[key], { interceptors: [recorder] }));
      } catch {
        // A tool can fail on a fake answer or without its service: only its calls count
      }
    }
  }
  return edges;
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "mcp-calls-"));
  workspace = join(tmp, "workspace");
  mkdirSync(join(workspace, "packages", "calls-a", "src"), { recursive: true });
  writeFileSync(join(workspace, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
  writeFileSync(join(workspace, "package.json"), '{"name":"calls-root","private":true}\n');
  writeFileSync(join(workspace, "packages", "calls-a", "package.json"), '{"name":"@mark1russell7/calls-a","version":"0.0.0"}\n');
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("the nested calls of the MCP tools (MCP-3)", () => {
  it("has a sample input for each tool of code", () => {
    const tools = PROCEDURE_REGISTRY.getAll().filter((procedure) => procedure.handler && expose(procedure.path));
    const missing = tools
      .filter((procedure) => !isDataDriven(procedure))
      .map((procedure) => pathToKey(procedure.path))
      .filter((key) => !(key in samples()));
    expect(missing).toEqual([]);
  });

  it("declares each call to a procedure that is not a tool", async () => {
    const edges = await recordNestedCalls();
    const undeclared = [...edges]
      .map((edge) => edge.split(" -> ") as [string, string])
      .filter(([, to]) => !expose(to.split(".")))
      .filter(([from, to]) => {
        const caller = PROCEDURE_REGISTRY.get(from.split("."));
        const calls = caller ? declaredCalls(caller) : undefined;
        return !(calls ?? []).some((entry) => callMatches(entry, to));
      })
      .map(([from, to]) => `${from} -> ${to}`)
      .sort();
    expect(undeclared).toEqual([]);
    // The test reaches the calls that matter: a docker tool runs docker through shell.run
    expect(edges.has("docker.ps -> shell.run")).toBe(true);
  }, 120_000);

  it("reaches exactly the procedures of reachable.snapshot.txt", () => {
    const expected = readFileSync(join(packageDir, "reachable.snapshot.txt"), "utf8").trim().split(/\r?\n/);
    const received = hiddenReach(PROCEDURE_REGISTRY.getAll(), expose).map((call) => `${call.from} -> ${call.to}`);
    expect(received).toEqual(expected);
  });

  it("never reaches a shell string or the mark CLI", () => {
    const reached = hiddenReach(PROCEDURE_REGISTRY.getAll(), expose).map((call) => call.to);
    expect(reached).not.toContain("shell.exec");
    expect(reached).not.toContain("cli.run");
  });
});
