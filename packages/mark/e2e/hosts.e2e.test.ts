/**
 * The front door (roadmap 2.3): `mark mcp` starts the dev-tools MCP server over stdio, and
 * `mark serve` starts the procedure server. Each host has a registry of its own (roadmap 3.1).
 */

import { describe, it, expect } from "vitest";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { HttpTransport, subscribeRemote, type RemoteEvent } from "@procedures/client";
import { BIN, mark } from "./run.js";

const TOOLS = fileURLToPath(new URL("../../impl-mcp-dev/tools.snapshot.txt", import.meta.url));
/** A procedure package of the old kind with `e2e.publish`, which emits on `ctx.bus`. */
const PUBLISH_FIXTURE = fileURLToPath(new URL("./fixture-publish.mjs", import.meta.url));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** This function starts mark with the arguments, and waits until its output has `ready`. */
async function startMark(
  args: string[],
  ready: string,
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ child: ChildProcessWithoutNullStreams; output: () => string }> {
  const child = spawn(process.execPath, [BIN, ...args], {
    windowsHide: true,
    ...(options.cwd ? { cwd: options.cwd } : {}),
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...options.env },
  });
  let output = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No start within 60 s:\n${output}`)), 60000);
    const onData = (data: Buffer): void => {
      output += data.toString();
      if (output.includes(ready)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`mark ${args.join(" ")} exited with ${code}:\n${output}`));
    });
  });
  return { child, output: () => output };
}

/** A call over HTTP with a token: the status and the JSON body. */
async function post(url: string, token: string, input: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  return { status: response.status, body: await response.json().catch(() => undefined) };
}

async function waitFor(check: () => boolean, what: string): Promise<void> {
  const end = Date.now() + 10000;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** A small pnpm workspace with one package, for lib.scan. */
function workspace(folder: string, name: string): void {
  mkdirSync(join(folder, "packages", name), { recursive: true });
  writeFileSync(join(folder, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  writeFileSync(join(folder, "packages", name, "package.json"), JSON.stringify({ name }));
}

describe("mark mcp", () => {
  it("serves the tools of the dev-tools server over stdio, and writes only protocol lines to stdout", () => {
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ];
    // stdin ends after the requests: the server answers, then the process ends
    const run = spawnSync(process.execPath, [BIN, "mcp"], {
      input: requests.map((request) => JSON.stringify(request)).join("\n") + "\n",
      encoding: "utf8",
      timeout: 60000,
    });
    const lines = run.stdout.split("\n").filter((line) => line.trim() !== "");
    const messages = lines.map((line) => JSON.parse(line) as { id?: number; result?: { tools: Array<{ name: string }> } });
    const list = messages.find((message) => message.id === 2);
    const expected = readFileSync(TOOLS, "utf8").split(/\r?\n/).filter(Boolean);
    expect(list?.result?.tools.length).toBe(expected.length);
  }, 90000);

  it("serves the same tools over Streamable HTTP with --http and --token (roadmap R26)", async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [BIN, "mcp", "--http", String(port), "--token", "e2e-token"], { windowsHide: true });
    try {
      let output = "";
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No start within 60 s: ${output}`)), 60000);
        child.stderr.on("data", (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes("Streamable HTTP at")) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once("exit", (code) => reject(new Error(`mark mcp ended with ${code}: ${output}`)));
      });
      const url = `http://127.0.0.1:${port}/mcp`;
      const post = (body: unknown, headers: Record<string, string> = {}) =>
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer e2e-token", ...headers },
          body: JSON.stringify(body),
        });
      const refused = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { authorization: "Bearer wrong" });
      expect(refused.status).toBe(401);
      const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } } });
      const session = init.headers.get("mcp-session-id")!;
      expect(session).toBeTruthy();
      await init.text();
      await (await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { "mcp-session-id": session })).text();
      const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { "mcp-session-id": session });
      const text = await list.text();
      // The answer is JSON or one server-sent event with the JSON
      const dataLine = text.split(/\r?\n/).find((line) => line.startsWith("data: "));
      const json = JSON.parse(text.startsWith("{") ? text : dataLine!.slice("data: ".length)) as {
        result: { tools: unknown[] };
      };
      const expected = readFileSync(TOOLS, "utf8").split(/\r?\n/).filter(Boolean);
      expect(json.result.tools.length).toBe(expected.length);
    } finally {
      child.kill();
    }
  }, 90000);

  it("prints its help to stderr", () => {
    const run = spawnSync(process.execPath, [BIN, "mcp", "--help"], { encoding: "utf8", timeout: 60000 });
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("mark mcp");
    expect(run.stderr).toContain("--fs-root");
  }, 90000);

  it("keeps the tools with --fs-root, and confines the nested fs calls of lib.scan (roadmap R33)", async () => {
    const base = mkdtempSync(join(tmpdir(), "mark-e2e-mcp-root-"));
    const root = join(base, "root");
    const outside = join(base, "outside");
    workspace(root, "inside-package");
    workspace(outside, "outside-package");
    const child = spawn(process.execPath, [BIN, "--fs-root", root, "mcp"], { windowsHide: true });
    type Reply = { id?: number; result?: { tools?: unknown[]; content?: Array<{ text: string }> } };
    const pending = new Map<number, (message: Reply) => void>();
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const message = JSON.parse(line) as Reply;
        if (message.id !== undefined) pending.get(message.id)?.(message);
      } catch {
        // not a JSON-RPC line
      }
    });
    let nextId = 1;
    const request = (method: string, params: unknown) =>
      new Promise<Reply>((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    try {
      await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      const list = await request("tools/list", {});
      const expected = readFileSync(TOOLS, "utf8").split(/\r?\n/).filter(Boolean);
      expect(list.result?.tools?.length).toBe(expected.length);
      const inside = await request("tools/call", { name: "lib.scan", arguments: { rootPath: root } });
      expect(inside.result?.content?.[0]?.text).toContain("inside-package");
      const refused = await request("tools/call", { name: "lib.scan", arguments: { rootPath: outside } });
      expect(refused.result?.content?.[0]?.text).toContain("outside the root");
      expect(refused.result?.content?.[0]?.text).not.toContain("outside-package");
    } finally {
      child.kill();
      rmSync(base, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 90000);
});

describe("mark serve", () => {
  it("serves the procedures of a package from mark's folder, with the token and the expose list", async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [BIN, "serve", "--port", String(port), "--token", "t", "--procedures", "@procedures/fs", "--expose", "fs.exists"], {
      windowsHide: true,
    });
    try {
      let output = "";
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No start within 60 s:\n${output}`)), 60000);
        const onData = (data: Buffer): void => {
          output += data.toString();
          if (output.includes("Press Ctrl+C")) {
            clearTimeout(timer);
            resolve();
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`mark serve exited with ${code}:\n${output}`));
        });
      });
      const call = async (path: string, token?: string): Promise<{ status: number; body: unknown }> => {
        const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ path: "." }),
        });
        return { status: response.status, body: await response.json().catch(() => undefined) };
      };
      const exists = await call("fs/exists", "t");
      expect(exists.status).toBe(200);
      expect(exists.body).toMatchObject({ exists: true });
      expect((await call("fs/exists")).status).toBe(401);
      expect((await call("fs/read", "t")).status).toBe(404);
      // Without --events, the server serves no topic
      const transport = new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api`, defaultHeaders: { Authorization: "Bearer t" } });
      const subscription = subscribeRemote(transport, ["e2e.orders.created"], () => {});
      await expect(subscription.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });
    } finally {
      child.kill();
    }
  }, 120000);

  it("serves the topics of --events, and a procedure publishes on the bus of the host (EVENTS.md)", async () => {
    const port = await freePort();
    const { child } = await startMark(
      ["serve", "--port", String(port), "--token", "t", "--procedures", PUBLISH_FIXTURE, "--events", "e2e.orders.*"],
      "Press Ctrl+C",
    );
    try {
      const transport = new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api`, defaultHeaders: { Authorization: "Bearer t" } });
      const events: RemoteEvent[] = [];
      const subscription = subscribeRemote(transport, ["e2e.orders.created"], (_data, event) => {
        events.push(event);
      });
      await subscription.ready;
      const published = await post(`http://127.0.0.1:${port}/api/e2e/publish`, "t", { topic: "e2e.orders.created", data: { order: 1 } });
      expect(published.status).toBe(200);
      await waitFor(() => events.length === 1, "the event of e2e.publish");
      expect(events[0]).toMatchObject({ topic: "e2e.orders.created", data: { order: 1 }, seq: 1 });
      subscription();
      const outside = subscribeRemote(transport, ["e2e.audit.created"], () => {});
      await expect(outside.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });
    } finally {
      child.kill();
    }
  }, 120000);

  it("confines fs.* to --fs-root", async () => {
    const base = mkdtempSync(join(tmpdir(), "mark-e2e-serve-root-"));
    const root = join(base, "root");
    mkdirSync(root);
    writeFileSync(join(root, "inside.txt"), "inside");
    writeFileSync(join(base, "outside.txt"), "outside");
    const port = await freePort();
    // The root before serve applies to the server of serve
    const { child, output } = await startMark(["--fs-root", root, "serve", "--port", String(port), "--token", "t", "--procedures", "@procedures/fs"], "Press Ctrl+C");
    try {
      expect(output()).toContain(`File root: ${root}`);
      const inside = await post(`http://127.0.0.1:${port}/api/fs/read`, "t", { path: "inside.txt" });
      expect(inside).toMatchObject({ status: 200, body: { content: "inside" } });
      const refused = await post(`http://127.0.0.1:${port}/api/fs/read`, "t", { path: join(base, "outside.txt") });
      expect(refused.status).toBe(403);
    } finally {
      child.kill();
      rmSync(base, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 120000);
});

describe("mark --server", () => {
  it("serves the topics of --events, confines fs.* to --fs-root, and takes only the commands of the same root", async () => {
    const home = mkdtempSync(join(tmpdir(), "mark-e2e-server-"));
    const root = join(home, "root");
    mkdirSync(root);
    writeFileSync(join(root, "inside.txt"), "inside");
    writeFileSync(join(home, "outside.txt"), "outside");
    const env = { HOME: home, USERPROFILE: home };
    const port = await freePort();
    const { child } = await startMark(["--fs-root", root, "--server", "--port", String(port), "--events", "e2e.audit.*"], "Press Ctrl+C", {
      cwd: home,
      env,
    });
    try {
      const lock = JSON.parse(readFileSync(join(home, ".mark", "servers", `${port}.lock`), "utf8")) as { endpoint: string; token: string; fsRoot?: string };
      expect(lock.fsRoot).toBe(root);
      const transport = new HttpTransport({ baseUrl: lock.endpoint, defaultHeaders: { Authorization: `Bearer ${lock.token}` } });
      const subscription = subscribeRemote(transport, ["e2e.audit.created"], () => {});
      await subscription.ready;
      subscription();
      const outsideTopic = subscribeRemote(transport, ["e2e.orders.created"], () => {});
      await expect(outsideTopic.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });

      // The fs procedures of the server: a relative path starts at the root
      expect(await post(`${lock.endpoint}/fs/read`, lock.token, { path: "inside.txt" })).toMatchObject({ status: 200, body: { content: "inside" } });
      expect((await post(`${lock.endpoint}/fs/read`, lock.token, { path: join(home, "outside.txt") })).status).toBe(403);

      // A command with the same root: refused. A command without a root does not use this server.
      const confined = mark(["--fs-root", root, "fs", "read", join(home, "outside.txt")], { cwd: home, env });
      expect(confined.exitCode).toBe(1);
      expect(confined.stdout + confined.stderr).toContain("outside the root");
      const free = mark(["fs", "read", join(home, "outside.txt"), "--format", "json"], { cwd: home, env });
      expect(free.exitCode).toBe(0);
      expect(free.stdout).toContain("outside");
    } finally {
      child.kill();
      rmSync(home, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 180000);
});
