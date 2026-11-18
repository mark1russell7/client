/**
 * The quality gate of the tool search (direction 40). The golden queries of search.golden.json
 * are tasks in the words of a model. The test ranks each query over the tools of the dev-tools
 * server, as `search_tools` ranks them, and it holds three measures:
 * - hit1: the number of queries whose first hit is an expected tool;
 * - hit5: the number of queries with an expected tool in the first 5 hits;
 * - mrr: the mean of 1 / rank of the first expected hit in the first 10 hits (0 for no hit).
 *
 * The search is deterministic, so each measure is the same at each run. A drop under a floor
 * fails. A gain also fails, until the floors in search.golden.json record it: so the gate holds
 * each gain. To accept a change, start the test with UPDATE_SEARCH_FLOORS=1 and review the diff.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { searchDocuments } from "@procedures/client";
import { toolSearchDocuments } from "@procedures/mcp-server";
import type { SearchDocument } from "@procedures/client";
import type { McpServerConfig } from "./config.js";
import { createDevToolsHost } from "./host.js";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const goldenFile = join(packageDir, "search.golden.json");

interface Floors {
  queries: number;
  hit1: number;
  hit5: number;
  mrr: number;
}

interface Golden {
  about: string;
  floors: Floors;
  queries: { query: string; expect: string[] }[];
}

const config: McpServerConfig = {
  bundles: ["@procedures/bundle-mcp"],
  serverName: "test",
  serverVersion: "0",
  debug: false,
  toolTimeoutMs: 0,
};

const golden = JSON.parse(readFileSync(goldenFile, "utf8")) as Golden;
let documents: SearchDocument[];

beforeAll(async () => {
  const host = await createDevToolsHost(config);
  documents = toolSearchDocuments(host.mcp.tools());
});

/** The rank (from 1) of the first expected tool in the first 10 hits of a query, or undefined. */
function rankOf(query: string, expected: readonly string[]): number | undefined {
  const index = searchDocuments(documents, query, { limit: 10 }).hits.findIndex((hit) => expected.includes(hit.name));
  return index === -1 ? undefined : index + 1;
}

describe("the quality of the tool search", () => {
  it("names only tools of the server in the golden set", () => {
    const names = new Set(documents.map((document) => document.name));
    const unknown = golden.queries.flatMap((query) => query.expect.filter((name) => !names.has(name)));
    expect(unknown, "these expected tools are not tools of the server").toEqual([]);
  });

  it("holds the floors of hit1, hit5 and mrr", () => {
    const ranks = golden.queries.map((query) => ({ query: query.query, rank: rankOf(query.query, query.expect) }));
    const measured: Floors = {
      queries: ranks.length,
      hit1: ranks.filter((entry) => entry.rank === 1).length,
      hit5: ranks.filter((entry) => entry.rank !== undefined && entry.rank <= 5).length,
      mrr: Math.round((ranks.reduce((sum, entry) => sum + (entry.rank === undefined ? 0 : 1 / entry.rank), 0) / ranks.length) * 1000) / 1000,
    };
    console.log(`search quality: hit1 ${measured.hit1} of ${measured.queries}, hit5 ${measured.hit5} of ${measured.queries}, mrr ${measured.mrr}`);
    const misses = ranks.filter((entry) => entry.rank === undefined || entry.rank > 5).map((entry) => `${entry.query} (${entry.rank ?? "no hit in 10"})`);
    console.log(`search quality: not in the first 5: ${misses.length === 0 ? "none" : misses.join("; ")}`);

    if (process.env["UPDATE_SEARCH_FLOORS"] === "1") {
      writeFileSync(goldenFile, `${JSON.stringify({ ...golden, floors: measured }, null, 2)}\n`);
      return;
    }
    expect(measured, "The search quality changed. Review the queries not in the first 5, then start the test with UPDATE_SEARCH_FLOORS=1").toEqual(golden.floors);
  });
});
