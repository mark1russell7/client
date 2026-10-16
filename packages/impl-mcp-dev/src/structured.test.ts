/**
 * MCP structured output (roadmap 2.1): each tool whose output is an object declares an
 * `outputSchema`, and each successful result has `structuredContent`.
 *
 * The test starts the built server over stdio and calls tools with the client of the MCP SDK.
 * That client checks the structured content of a result against the output schema of the tool,
 * so a schema that does not match what the handler gives makes the call throw.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The part of the SDK client that the test uses. */
interface McpClient {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ tools: unknown[] }>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{ structuredContent?: unknown; isError?: boolean }>;
  close(): Promise<void>;
}

// The SDK comes from client-mcp, the package that depends on it
const sdk = createRequire(join(packageDir, "..", "client-mcp", "package.json"));
const { Client } = (await import(pathToFileURL(sdk.resolve("@modelcontextprotocol/sdk/client/index.js")).href)) as {
  Client: new (info: { name: string; version: string }) => McpClient;
};
const { StdioClientTransport } = (await import(pathToFileURL(sdk.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href)) as {
  StdioClientTransport: new (options: { command: string; args: string[]; stderr?: string }) => unknown;
};

/**
 * The core tools whose result is not an object: a boolean (`not`, `all`, `any`, `none`), any JSON
 * value whose shape depends on the program (`and`, `or`, `conditional`, `reduce`, `identity`,
 * `constant`) or no value (`throw`). They have real output schemas, but MCP gives an
 * `outputSchema` only to an object result.
 */
const NOT_OBJECT_OUTPUT = new Set([
  "client.all",
  "client.and",
  "client.any",
  "client.conditional",
  "client.constant",
  "client.identity",
  "client.none",
  "client.not",
  "client.or",
  "client.reduce",
  "client.throw",
]);

/** A tool whose output is a union (one value, or a stream of items): no object schema. */
const UNION_OUTPUT = new Set(["docker.logs"]);

let client: McpClient;
let tmp: string;
let tools: Array<{ name: string; outputSchema?: { type?: string; properties?: Record<string, { description?: string }> } }>;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "mcp-structured-"));
  client = new Client({ name: "structured-test", version: "0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [join(packageDir, "dist", "server.js")], stderr: "ignore" })
  );
  tools = (await client.listTools()).tools as typeof tools;
}, 60_000);

afterAll(async () => {
  await client?.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe("MCP structured output", () => {
  it("declares an object output schema with field descriptions for each tool with an object result", () => {
    const missing: string[] = [];
    const undescribed: string[] = [];
    for (const tool of tools) {
      if (NOT_OBJECT_OUTPUT.has(tool.name) || UNION_OUTPUT.has(tool.name)) continue;
      if (tool.outputSchema?.type !== "object") {
        missing.push(tool.name);
        continue;
      }
      for (const [field, property] of Object.entries(tool.outputSchema.properties ?? {})) {
        if (!property.description) undescribed.push(`${tool.name}.${field}`);
      }
    }
    expect(missing, "tools without an object output schema").toEqual([]);
    expect(undescribed, "output fields without a description").toEqual([]);
  });

  it("gives structured content that the SDK client accepts (sqlite.execute, sqlite.query, logs)", async () => {
    const dbPath = join(tmp, "structured.db");
    await client.callTool({ name: "sqlite.execute", arguments: { dbPath, sql: "CREATE TABLE t (n INTEGER, s TEXT)" } });
    const inserted = await client.callTool({ name: "sqlite.execute", arguments: { dbPath, sql: "INSERT INTO t VALUES (?, ?)", params: [1, "a"] } });
    expect(inserted.structuredContent).toEqual({ changes: 1 });

    const queried = await client.callTool({ name: "sqlite.query", arguments: { dbPath, sql: "SELECT n, s FROM t" } });
    expect(queried.isError).toBeFalsy();
    expect(queried.structuredContent).toEqual({ columns: ["n", "s"], rows: [{ n: 1, s: "a" }] });

    await client.callTool({ name: "logs.store", arguments: { dbPath, level: "info", message: "hello", data: { k: 1 } } });
    const logs = await client.callTool({ name: "logs.query", arguments: { dbPath } });
    expect(logs.isError).toBeFalsy();
    expect((logs.structuredContent as { logs: Array<{ message: string }> }).logs[0]?.message).toBe("hello");
  }, 60_000);

  it("gives structured content for the cue and lib tools", async () => {
    // cue.validate on a folder with no dependencies.json: a result, not an error
    const empty = join(tmp, "empty");
    mkdirSync(empty);
    const validated = await client.callTool({ name: "cue.validate", arguments: { cwd: empty } });
    expect(validated.isError).toBeFalsy();
    expect(validated.structuredContent).toMatchObject({ valid: false });

    // lib.scan on a small workspace
    const workspace = join(tmp, "workspace");
    mkdirSync(join(workspace, "packages", "a"), { recursive: true });
    writeFileSync(join(workspace, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    writeFileSync(join(workspace, "package.json"), '{"name":"root","private":true}\n');
    writeFileSync(join(workspace, "packages", "a", "package.json"), '{"name":"@mark1russell7/structured-a","version":"0.0.0"}\n');
    const scanned = await client.callTool({ name: "lib.scan", arguments: { rootPath: workspace } });
    expect(scanned.isError).toBeFalsy();
    expect(Object.keys((scanned.structuredContent as { packages: Record<string, unknown> }).packages)).toContain(
      "@mark1russell7/structured-a"
    );
  }, 60_000);

  it("gives structured content for the core tools with an object result", async () => {
    const mapped = await client.callTool({
      name: "client.map",
      // fn calls an exposed tool: a data-driven procedure calls only exposed procedures
      arguments: { items: [1, 2, 3], fn: { $proc: ["client", "identity"], input: { value: { $ref: "item" } } } },
    });
    expect(mapped.isError).toBeFalsy();
    expect(mapped.structuredContent).toEqual({ results: [1, 2, 3] });

    const caught = await client.callTool({
      name: "client.tryCatch",
      arguments: { try: { $proc: ["client", "throw"], input: { message: "boom" } }, catch: "caught" },
    });
    expect(caught.structuredContent).toMatchObject({ success: false, value: "caught", error: "boom" });

    const found = await client.callTool({ name: "procedure.get", arguments: { path: "client.map" } });
    expect(found.structuredContent).toMatchObject({ found: true, key: "client.map", runtime: false });
    const missing = await client.callTool({ name: "procedure.get", arguments: { path: "no.such" } });
    expect(missing.structuredContent).toEqual({ found: false });
  }, 60_000);

  it("gives no structured content for an error", async () => {
    const failed = await client.callTool({ name: "sqlite.query", arguments: { dbPath: join(tmp, "x.db"), sql: "SELECT * FROM missing" } });
    expect(failed.isError).toBe(true);
    expect(failed.structuredContent).toBeUndefined();
  }, 60_000);
});
