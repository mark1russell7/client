/**
 * The cost gate of the search listing (direction 40). The test starts the built server two times
 * over stdio: with the listing of each tool, and with `MCP_LISTING=search`. It measures the UTF-8
 * bytes of the JSON that the model reads:
 * - each: the list of each tool, which a session reads before its first call;
 * - search: the list of the three search tools;
 * - a task: the search listing, the text of one `search_tools` result and the text of one
 *   `describe_tool` result, for each query of search.golden.json.
 *
 * The bytes are a measure of the tokens: the tokenizer of the model is not in the test. A call
 * costs the same in the two listings, so a task has no call. The test holds two limits of
 * listing.cost.json: the bytes of the search listing, exactly, and a ceiling on the share of the
 * worst task in the list of each tool. A new tool makes the list of each tool larger, so it does
 * not fail the gate. To accept a change, start the test with UPDATE_LISTING_COST=1 and review the diff.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const costFile = join(packageDir, "listing.cost.json");
const goldenFile = join(packageDir, "search.golden.json");

/** The part of the SDK client that the test uses. */
interface McpClient {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ tools: unknown[] }>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{ content?: Array<{ type: string; text?: string }>; isError?: boolean }>;
  close(): Promise<void>;
}

// The SDK comes from client-mcp, the package that depends on it
const sdk = createRequire(join(packageDir, "..", "client-mcp", "package.json"));
const { Client } = (await import(pathToFileURL(sdk.resolve("@modelcontextprotocol/sdk/client/index.js")).href)) as {
  Client: new (info: { name: string; version: string }) => McpClient;
};
const { StdioClientTransport } = (await import(pathToFileURL(sdk.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href)) as {
  StdioClientTransport: new (options: { command: string; args: string[]; env?: Record<string, string>; stderr?: string }) => unknown;
};

interface Limits {
  /** The bytes of the list of the three search tools. It changes only with the search listing. */
  searchListingBytes: number;
  /** The most bytes of one task, as a share of the bytes of the list of each tool. */
  worstTaskShare: number;
}

interface CostFile {
  about: string;
  limits: Limits;
}

const golden = JSON.parse(readFileSync(goldenFile, "utf8")) as { queries: { query: string; expect: string[] }[] };
const bytes = (value: string): number => Buffer.byteLength(value, "utf8");

/** The text that the model reads from a result: its text blocks. */
function textOf(result: Awaited<ReturnType<McpClient["callTool"]>>): string {
  return (result.content ?? []).map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("");
}

async function start(listing: "each" | "search"): Promise<McpClient> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  if (listing === "search") env["MCP_LISTING"] = "search";
  else delete env["MCP_LISTING"];
  const client = new Client({ name: `listing-cost-${listing}`, version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(packageDir, "dist", "server.js")], env, stderr: "ignore" }));
  return client;
}

let each: McpClient;
let search: McpClient;

beforeAll(async () => {
  [each, search] = await Promise.all([start("each"), start("search")]);
}, 60_000);

afterAll(async () => {
  await Promise.all([each?.close(), search?.close()]);
});

describe("the cost of the search listing", () => {
  it("holds the bytes of the search listing and the ceiling on the share of the worst task", async () => {
    const eachTools = (await each.listTools()).tools;
    const searchTools = (await search.listTools()).tools;
    expect(searchTools.map((tool) => (tool as { name: string }).name)).toEqual(["search_tools", "describe_tool", "call_tool"]);
    const eachBytes = bytes(JSON.stringify({ tools: eachTools }));
    const searchListingBytes = bytes(JSON.stringify({ tools: searchTools }));

    const tasks: { query: string; bytes: number }[] = [];
    for (const { query, expect: expected } of golden.queries) {
      const found = await search.callTool({ name: "search_tools", arguments: { query } });
      const described = await search.callTool({ name: "describe_tool", arguments: { name: expected[0]! } });
      expect(found.isError ?? false, `search_tools refused "${query}"`).toBe(false);
      expect(described.isError ?? false, `describe_tool refused ${expected[0]}`).toBe(false);
      tasks.push({ query, bytes: searchListingBytes + bytes(textOf(found)) + bytes(textOf(described)) });
    }
    const worst = tasks.reduce((most, task) => (task.bytes > most.bytes ? task : most));
    const mean = Math.round(tasks.reduce((sum, task) => sum + task.bytes, 0) / tasks.length);
    const worstTaskShare = worst.bytes / eachBytes;
    console.log(
      `listing cost: each ${eachBytes} bytes for ${eachTools.length} tools, search listing ${searchListingBytes} bytes, ` +
        `a task ${mean} bytes on average and ${worst.bytes} at most ("${worst.query}"), the worst task ${(worstTaskShare * 100).toFixed(1)}% of each`,
    );

    const file = JSON.parse(readFileSync(costFile, "utf8")) as CostFile;
    if (process.env["UPDATE_LISTING_COST"] === "1") {
      // The ceiling is the share of this run, up to the next whole percent
      file.limits = { searchListingBytes, worstTaskShare: Math.ceil(worstTaskShare * 100) / 100 };
      writeFileSync(costFile, `${JSON.stringify(file, null, 2)}\n`);
      return;
    }
    expect(searchListingBytes, "the search listing changed: start the test with UPDATE_LISTING_COST=1 to accept it").toBe(file.limits.searchListingBytes);
    expect(worstTaskShare, `the task "${worst.query}" costs more than the ceiling of listing.cost.json`).toBeLessThanOrEqual(file.limits.worstTaskShare);
  }, 60_000);
});
