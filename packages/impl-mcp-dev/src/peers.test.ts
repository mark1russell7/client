/**
 * The running peers of `MCP_PEERS` (d40-tool-surface, step 2). Each peer of the test is a
 * procedures server with a token on a free port of `127.0.0.1`. It writes a discovery file of the
 * form of a daemon: `endpoint` and `token`. The host reads its manifest, and each call of a tool of
 * the peer goes to the peer.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ProcedureServer, createRegistry, hostPolicy, procedureServerOptions, type AnyProcedure, type ProcedureModule } from "@procedures/client";
import { procedureHandler } from "@procedures/client/node";
import { procedureToMcpTool } from "@procedures/mcp-server";
import { parsePeers, type McpServerConfig } from "./config.js";
import { createDevToolsHost } from "./host.js";
import { peerAddress, readDiscovery } from "./peers.js";

const config: McpServerConfig = { bundles: [], serverName: "test", serverVersion: "0", debug: false, toolTimeoutMs: 0 };

let folder: string;
let cleanups: Array<() => Promise<void>> = [];

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "mcp-peers-"));
});

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** A Standard Schema validator with its JSON Schema. */
function schema(json: Record<string, unknown>, check: (value: unknown) => boolean): unknown {
  return {
    "~standard": { version: 1, vendor: "test", validate: (value: unknown) => (check(value) ? { value } : { issues: [{ message: "The value does not fit." }] }) },
    "~jsonSchema": json,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const NAME_INPUT = schema({ type: "object", properties: { name: { type: "string" } }, required: ["name"] }, (value) => isRecord(value) && typeof value["name"] === "string");
const NO_INPUT = schema({ type: "object" }, isRecord);
const ANY = schema({}, () => true);

/** The jobs of a peer, under the namespace `namespace`. Each answer names the peer. */
function jobsModule(peer: string, namespace = "jobs"): ProcedureModule {
  const jobs: string[] = [];
  return {
    name: `${namespace}-module`,
    procedures: [
      {
        path: [namespace, "add"],
        input: NAME_INPUT,
        output: ANY,
        metadata: { description: "This procedure adds a job.", effects: { reads: ["jobs"], writes: ["jobs"] } },
        handler: async (input: { name: string }) => {
          jobs.push(input.name);
          return { count: jobs.length, peer };
        },
      },
      {
        path: [namespace, "list"],
        input: NO_INPUT,
        output: ANY,
        metadata: { description: "This procedure lists the jobs.", effects: { reads: ["jobs"], writes: [] } },
        handler: async () => [...jobs],
      },
    ] as AnyProcedure[],
  };
}

/** This function starts a peer on a free port, with a token unless `open`, and writes its discovery file. */
async function startPeer(name: string, module: ProcedureModule, open = false): Promise<{ file: string; url: string }> {
  const token = open ? undefined : `token-${name}`;
  const server = new ProcedureServer(procedureServerOptions(hostPolicy(token !== undefined ? { token } : {}), createRegistry(module)));
  server.registerFromRegistry();
  const handler = procedureHandler(server, { basePath: "/api" });
  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (handler(req, res)) return;
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`;
  cleanups.push(async () => {
    await handler.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const file = join(folder, `${name}.json`);
  writeFileSync(file, JSON.stringify({ pid: 1, endpoint: url, token, startedAt: "2026-11-18T00:00:00Z" }));
  return { file, url };
}

/** This function calls a procedure through the server of a host. */
async function call(server: ProcedureServer, service: string, operation: string, payload: unknown): Promise<{ type: string; value: unknown }> {
  const response = await server.handle({ id: "1", method: { service, operation }, payload, metadata: {} });
  return { type: (response.status as { type: string }).type, value: response.payload };
}

describe("MCP_PEERS", () => {
  it("reads entries name=source, with a URL or a discovery file", () => {
    expect(parsePeers(undefined)).toEqual([]);
    expect(parsePeers(" ")).toEqual([]);
    expect(parsePeers("jobs=http://127.0.0.1:4000/api, files=C:\\peers\\files.json,,local=./peer.json")).toEqual([
      { name: "jobs", source: "http://127.0.0.1:4000/api" },
      { name: "files", source: "C:\\peers\\files.json" },
      { name: "local", source: "./peer.json" },
    ]);
  });

  it("refuses an entry that is not name=source, and a name in two entries", () => {
    expect(() => parsePeers("http://127.0.0.1:4000/api")).toThrow(/the entry "http:\/\/127.0.0.1:4000\/api" is not name=source/);
    expect(() => parsePeers("Jobs=http://127.0.0.1:4000/api")).toThrow(/is not name=source/);
    expect(() => parsePeers("jobs=")).toThrow(/is not name=source/);
    expect(() => parsePeers("jobs=./a.json,jobs=./b.json")).toThrow(/two entries have the name jobs/);
  });
});

describe("a discovery file", () => {
  it("gives the URL from url or endpoint, and the token", async () => {
    const daemon = join(folder, "daemon.json");
    writeFileSync(daemon, JSON.stringify({ pid: 7, endpoint: "http://127.0.0.1:4730/api", token: "secret" }));
    expect(await readDiscovery(daemon)).toEqual({ url: "http://127.0.0.1:4730/api", token: "secret" });
    const plain = join(folder, "plain.json");
    writeFileSync(plain, JSON.stringify({ url: "https://peer.example/api" }));
    expect(await readDiscovery(plain)).toEqual({ url: "https://peer.example/api" });
  });

  it("refuses a file that is missing, not JSON, without an HTTP URL, or with a token that is not a text", async () => {
    await expect(readDiscovery(join(folder, "missing.json"))).rejects.toThrow(/does not open \(is the peer running\?\)/);
    const bad = join(folder, "bad.json");
    writeFileSync(bad, "{");
    await expect(readDiscovery(bad)).rejects.toThrow(/is not JSON/);
    writeFileSync(bad, JSON.stringify({ endpoint: "ftp://peer/api" }));
    await expect(readDiscovery(bad)).rejects.toThrow(/has no HTTP URL in "url" or "endpoint"/);
    writeFileSync(bad, JSON.stringify({ url: "http://127.0.0.1:1/api", token: 7 }));
    await expect(readDiscovery(bad)).rejects.toThrow(/token of the discovery file .* is not a text/);
  });

  it("is read at each call, so the address follows a peer that starts again", async () => {
    const file = join(folder, "moving.json");
    writeFileSync(file, JSON.stringify({ url: "http://127.0.0.1:1000/api", token: "a" }));
    const address = peerAddress(pathToFileURL(file).href);
    expect(typeof address).toBe("function");
    expect(await (address as () => Promise<unknown>)()).toEqual({ url: "http://127.0.0.1:1000/api", token: "a" });
    writeFileSync(file, JSON.stringify({ url: "http://127.0.0.1:2000/api", token: "b" }));
    expect(await (address as () => Promise<unknown>)()).toEqual({ url: "http://127.0.0.1:2000/api", token: "b" });
    expect(peerAddress("http://127.0.0.1:3000/api")).toEqual({ url: "http://127.0.0.1:3000/api" });
  });
});

describe("the host with a running peer", () => {
  it("lists the procedures of the peer as tools, and sends each call to the peer", async () => {
    const peer = await startPeer("jobs", jobsModule("first"));
    const host = await createDevToolsHost({ ...config, peers: [{ name: "jobs", source: peer.file }] });
    expect(host.peers).toEqual([{ name: "jobs", source: peer.file, procedures: 2 }]);
    // Without bundles, the host has no surface: each procedure is a tool
    expect(host.surface).toBeUndefined();
    const tool = procedureToMcpTool(host.registry.get(["jobs", "list"])!);
    expect(tool.description).toContain("This procedure lists the jobs.");
    expect(tool.annotations).toMatchObject({ readOnlyHint: true });
    expect(await call(host.server, "jobs", "add", { name: "a" })).toEqual({ type: "success", value: { count: 1, peer: "first" } });
    expect(await call(host.server, "jobs", "list", {})).toEqual({ type: "success", value: ["a"] });
  });

  it("adds the namespaces of the peer to the tools of the bundles, for a peer with a URL and no token", async () => {
    const peer = await startPeer("jobs", jobsModule("first"), true);
    const host = await createDevToolsHost({ ...config, bundles: ["@procedures/bundle-mcp"], peers: [{ name: "jobs", source: peer.url }] });
    expect(host.peers).toEqual([{ name: "jobs", source: peer.url, procedures: 2 }]);
    expect(host.surface?.namespaces).toContain("jobs");
    expect(host.surface?.namespaces).toContain("docker");
    expect(host.policy.expose!(["jobs", "add"])).toBe(true);
    expect(host.policy.expose!(["shell", "exec"])).toBe(false);
  });

  it("keeps only the procedures of the peer that change nothing in a read-only host", async () => {
    const peer = await startPeer("jobs", jobsModule("first"));
    const host = await createDevToolsHost({ ...config, readOnly: true, peers: [{ name: "jobs", source: peer.file }] });
    expect(host.policy.expose!(["jobs", "list"])).toBe(true);
    expect(host.policy.expose!(["jobs", "add"])).toBe(false);
  });

  it("starts without a peer that does not answer, and its state tells why", async () => {
    const peer = await startPeer("jobs", jobsModule("first"));
    const missing = join(folder, "stopped.json");
    const host = await createDevToolsHost({ ...config, peers: [{ name: "stopped", source: missing }, { name: "jobs", source: peer.file }] });
    expect(host.peers[0]).toMatchObject({ name: "stopped", source: missing, error: expect.stringMatching(/does not open \(is the peer running\?\)/) });
    expect(host.peers[1]).toEqual({ name: "jobs", source: peer.file, procedures: 2 });
    expect(await call(host.server, "jobs", "list", {})).toEqual({ type: "success", value: [] });
  });

  it("does not start when two peers give one path, and names the path", async () => {
    const first = await startPeer("first", jobsModule("first"));
    const second = await startPeer("second", jobsModule("second"));
    await expect(
      createDevToolsHost({ ...config, peers: [{ name: "first", source: first.file }, { name: "second", source: second.file }] }),
    ).rejects.toThrow(/Two modules give the procedure jobs\.add: the second one is peer:second/);
  });
});
