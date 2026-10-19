/**
 * The MCP host under `run()` of `@mark1russell7/service` (CLI-11). `declare(svc)` gives the host
 * to a service: the runner starts it, and the trigger `stdin-close` starts the staged stop. A
 * fake process of the service gives the triggers and keeps the exit codes.
 */

import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { ephemeral, localDev, service } from "@mark1russell7/service";
import { httpTransport } from "@mark1russell7/service/http";
import { fakeProcess } from "@mark1russell7/service/testing";
import { createProcedure, defineModule, seconds, type AnyProcedure } from "@procedures/client";
import { createMcpHost, type McpRunnerPart, type McpServiceBuilder } from "./host.js";

const echo: AnyProcedure = createProcedure()
  .path(["test", "echo"])
  .input(z.object({ text: z.string() }))
  .output(z.object({ text: z.string() }))
  .meta({ description: "echo", effects: { reads: [], writes: [] } })
  .handler(async (input: { text: string }) => ({ text: input.text }))
  .build() as AnyProcedure;

const testModule = defineModule("runner-test", [echo]);

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

/** This function waits until a condition holds, in steps of 5 ms. */
async function until(condition: () => boolean): Promise<void> {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, 5));
}

describe("McpHost.declare", () => {
  it("declares the server part, and the trigger stdin-close for a stdio face", () => {
    const calls: string[] = [];
    const parts: McpRunnerPart[] = [];
    const builder: McpServiceBuilder = {
      server: (name, _knobs, impl) => {
        calls.push(`server ${name}`);
        parts.push(impl);
      },
      dependency: (name) => calls.push(`dependency ${name}`),
      trigger: (trigger) => calls.push(`trigger ${trigger}`),
    };
    const stdio = createMcpHost({ modules: [testModule], faces: { stdio: { stdin: new PassThrough(), stdout: new PassThrough(), redirectConsole: false } } });
    expect(stdio.declare(builder)).toBe(builder);
    expect(calls).toEqual(["server mcp", "trigger stdin-close"]);
    expect(() => stdio.declare(builder)).toThrow("one time");
    return expect(stdio.start()).rejects.toThrow("run() of the service starts it");
  });

  it("closes the task store of the host in the close of the runner part (CLI-35)", async () => {
    const parts: McpRunnerPart[] = [];
    const host = createMcpHost({ modules: [testModule], faces: { http: { mount: true } }, tasks: {} });
    host.declare({ server: (_name, _knobs, impl) => parts.push(impl), dependency: () => undefined, trigger: () => undefined });
    await parts[0]!.start(new AbortController().signal, undefined);
    const store = host.tasks!;
    await parts[0]!.close();
    await host.closed;
    // The store closed: it starts no task
    await expect(store.createTask({}, 1, { method: "tools/call", params: { name: "test.echo" } })).rejects.toThrow(/stopping/);
  });

  it("declares no trigger without a stdio face", () => {
    const calls: string[] = [];
    const host = createMcpHost({ modules: [testModule], faces: { http: { mount: true } } });
    host.declare({ server: (name) => calls.push(`server ${name}`), dependency: () => undefined, trigger: (trigger) => calls.push(`trigger ${trigger}`) });
    expect(calls).toEqual(["server mcp"]);
  });

  it("runs over stdio until the trigger stdin-close, then stops in stages and exits with 0", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const lines: string[] = [];
    stdout.on("data", (chunk: Buffer) => lines.push(...chunk.toString("utf8").split("\n").filter(Boolean)));
    const host = createMcpHost({ modules: [testModule], faces: { stdio: { stdin, stdout, redirectConsole: false } } });
    const proc = fakeProcess();
    const life = await host.declare(service("mcp-test").profile(ephemeral)).run({ process: proc });
    expect(life.state).toBe("running");
    expect(host.state()).toMatchObject({ running: true, faces: [{ transport: "stdio", running: true }] });

    stdin.write(JSON.stringify(INITIALIZE) + "\n");
    await until(() => lines.length > 0);
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: 1, result: { serverInfo: { name: "procedure-server" } } });

    // The end of the stream alone does not stop a host of a service: the runner owns the stop
    stdin.end();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(host.state().running).toBe(true);

    proc.trigger("stdin-close");
    expect(await life.done).toBe(0);
    await host.closed;
    expect(proc.exits).toEqual([0]);
    expect(host.state()).toMatchObject({ running: false, faces: [{ running: false }] });
  });

  it("serves Streamable HTTP on a listener of the service, and the stop closes it", async () => {
    const host = createMcpHost({ modules: [testModule], faces: { http: { mount: true } } });
    const listener = httpTransport(
      createServer(),
      { server_idle_close: seconds(5), server_idle_sweep_interval: seconds(1), server_retry_after: seconds(1) },
      { listen: { port: 0, host: "127.0.0.1" } },
    );
    listener.mount((req, res) => host.handleHttp(req, res));
    // localDev leaves the policies to the service
    const svc = host
      .declare(service("mcp-http-test").profile(localDev))
      .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
      .liveness({ type: "window", failAfter: seconds(45) })
      .startup(seconds(30));
    svc.server("mcp-http-test.listen", listener.knobs, listener);
    const proc = fakeProcess();
    const life = await svc.run({ process: proc });
    const { port } = listener.server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(INITIALIZE),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeTruthy();
    await response.body?.cancel();
    // Another path is not the endpoint: the listener answers it, not the MCP face
    const other = await fetch(`http://127.0.0.1:${port}/other`);
    expect(other.status).toBe(404);

    proc.signal("SIGTERM");
    await life.done;
    await host.closed;
    expect(host.state().running).toBe(false);
    expect(listener.server.listening).toBe(false);
  });
});
