/**
 * The warm mode: mark sends a command to a running CLI server only when the server suits this
 * run, and it reports each item and each failure of the call. The lockfile and the client are fakes.
 */

import { beforeEach, describe, it, expect, vi } from "vitest";

const fake = vi.hoisted(() => ({
  server: null as null | { endpoint: string; token?: string; transport?: string },
  items: [] as unknown[],
  failure: undefined as unknown,
  headers: undefined as unknown,
}));

vi.mock("./lockfile.js", () => ({
  currentBuild: () => "build-1",
  findServer: async () => fake.server,
}));

vi.mock("@procedures/client", () => ({
  HttpTransport: class {
    constructor(options: { defaultHeaders?: unknown }) {
      fake.headers = options.defaultHeaders;
    }
  },
  Client: class {
    async *stream(): AsyncGenerator<unknown> {
      for (const item of fake.items) yield item;
      if (fake.failure !== undefined) throw fake.failure;
    }
  },
  pathToMethod: (path: string[]) => ({ service: path.slice(0, -1).join("."), operation: path.at(-1) ?? "" }),
}));

import { cliServerConnection, connectCliServer, tryClientMode } from "./client-mode.js";

beforeEach(() => {
  fake.server = { endpoint: "http://server.test", token: "secret" };
  fake.items = [];
  fake.failure = undefined;
  fake.headers = undefined;
});

describe("connectCliServer", () => {
  it("never sends a server.* command to a server", async () => {
    expect(await connectCliServer(["server", "stop"])).toBeNull();
  });

  it("gives null with no server, a server without a token, or a WebSocket server", async () => {
    fake.server = null;
    expect(await connectCliServer(["fs", "read"])).toBeNull();
    fake.server = { endpoint: "http://server.test" };
    expect(await connectCliServer(["fs", "read"])).toBeNull();
    fake.server = { endpoint: "ws://server.test", token: "secret", transport: "websocket" };
    expect(await connectCliServer(["fs", "read"])).toBeNull();
  });

  it("connects to a server with a token, and sends the token", async () => {
    expect(await connectCliServer(["fs", "read"])).not.toBeNull();
    expect(fake.headers).toEqual({ Authorization: "Bearer secret" });
  });
});

describe("a call on the server", () => {
  it("gives the last item as the result, and each item to onItem", async () => {
    fake.items = [1, 2, 3];
    const seen: unknown[] = [];
    const result = await tryClientMode(["job", "run"], {}, (item) => seen.push(item));
    expect(result).toEqual({ success: true, result: 3, printed: true });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("is not printed without onItem", async () => {
    fake.items = ["done"];
    const connection = await cliServerConnection({ endpoint: "http://server.test", token: "t" }, ["job", "run"]);
    expect(await connection?.call({}, undefined, new AbortController().signal)).toEqual({
      success: true,
      result: "done",
      printed: false,
    });
  });

  it("fails when the server gives no item", async () => {
    expect(await tryClientMode(["job", "run"], {})).toEqual({
      success: false,
      error: "No response received from the CLI server",
    });
  });

  it("gives the message of an error, or the text of another failure", async () => {
    fake.failure = new Error("refused");
    expect(await tryClientMode(["job", "run"], {})).toEqual({ success: false, error: "refused" });
    fake.failure = "plain";
    expect(await tryClientMode(["job", "run"], {})).toEqual({ success: false, error: "plain" });
  });

  it("gives null when no server suits the run", async () => {
    fake.server = null;
    expect(await tryClientMode(["job", "run"], {})).toBeNull();
  });
});
