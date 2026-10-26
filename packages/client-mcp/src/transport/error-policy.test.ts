/**
 * The error policy of the server (roadmap CLI-80) on the MCP face. The server applies the policy
 * in `handle()`, so the tool result of an error has the code and the message of the policy, before
 * a stream and at the end of a stream. The last-resort catch of the face (when
 * `handle()` throws) applies the same policy.
 *
 * The HTTP and WebSocket faces have the same cases in `client/src/server/error-policy.test.ts`.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ProcedureRegistry, ProcedureServer, ServerError, createProcedure, type ErrorCall, type ServerErrorPolicy } from "@procedures/client";
import { McpServerTransport } from "./mcp-transport.js";

const READS = { reads: [], writes: [] };

/** The raw message of a duplicate key of MongoDB. */
const MONGO_MESSAGE = 'E11000 duplicate key error collection: app.users index: email_1 dup key: { email: "a@example.com" }';

const KINDS = ["raw", "coded", "conflict", "econnrefused", "mongo"] as const;
type Kind = (typeof KINDS)[number];

function errorOf(kind: Kind): Error {
  switch (kind) {
    case "raw":
      return new Error(MONGO_MESSAGE);
    case "coded":
      return new ServerError("No user has the id u1", "NOT_FOUND");
    case "conflict":
      return Object.assign(new Error("The row changed"), { code: "CONFLICT", retryable: true });
    case "econnrefused":
      return Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:19100"), { code: "ECONNREFUSED", errno: -111 });
    case "mongo":
      return Object.assign(new Error(MONGO_MESSAGE), { code: 11000, codeName: "DuplicateKey" });
  }
}

function registryOf(): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  registry.register(
    createProcedure()
      .path(["test", "fail"])
      .input(z.object({ kind: z.enum(KINDS), at: z.enum(["call", "stream"]).optional() }))
      .output(z.string())
      .meta({ description: "fails", effects: READS })
      .handler((async (input: { kind: Kind; at?: "call" | "stream" }) => {
        if (input.at !== "stream") throw errorOf(input.kind);
        return (async function* () {
          yield "row 1";
          throw errorOf(input.kind);
        })();
      }) as never)
      .build(),
  );
  return registry;
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** An MCP client of a server with the error policy, and the errors that the logger of the server got. */
async function start(errors: ServerErrorPolicy | undefined, onRequest?: () => void) {
  const registry = registryOf();
  const logged: Error[] = [];
  const server = new ProcedureServer({ registry, autoRegister: true, onError: (error) => void logged.push(error), ...(errors ? { errors } : {}), ...(onRequest ? { onRequest } : {}) });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  server.addTransport(new McpServerTransport(server, { registry, sdkTransport: serverSide }));
  await server.start();
  const client = new McpClient({ name: "test", version: "0" });
  await client.connect(clientSide);
  cleanups.push(async () => {
    await client.close();
    await server.stop();
  });
  const name = (await client.listTools()).tools.find((tool) => tool.description === "fails")!.name;
  /** The text, the code and the retryable flag of the tool result of a call. */
  const call = async (kind: Kind, at: "call" | "stream" = "call") => {
    const result = (await client.callTool({ name, arguments: { kind, at } })) as {
      content: Array<{ text: string }>;
      isError?: boolean;
      _meta?: { code?: string; retryable?: boolean };
    };
    expect(result.isError).toBe(true);
    return { text: result.content.map((block) => block.text).join("\n"), code: result._meta?.code, retryable: result._meta?.retryable };
  };
  return { call, logged };
}

describe("the error policy on the MCP face (CLI-80)", () => {
  it("the default sends the raw message, as before", async () => {
    const { call, logged } = await start(undefined);
    expect(await call("raw")).toMatchObject({ code: "HANDLER_ERROR", text: MONGO_MESSAGE });
    expect((await call("raw", "stream")).text).toContain(MONGO_MESSAGE);
    expect(logged).toEqual([]);
  });

  it("expose: \"coded\" sends INTERNAL_ERROR \"internal error\" for an error without a known code, and logs it", async () => {
    const { call, logged } = await start({ expose: "coded" });
    for (const kind of ["raw", "econnrefused", "mongo"] as const) {
      for (const at of ["call", "stream"] as const) {
        logged.length = 0;
        const seen = await call(kind, at);
        expect(seen, `${kind} ${at}`).toMatchObject({ code: "INTERNAL_ERROR", retryable: false });
        expect(seen.text, `${kind} ${at}`).toContain("internal error");
        for (const leak of ["E11000", "ECONNREFUSED", "19100", "email"]) expect(seen.text, `${kind} ${at}`).not.toContain(leak);
        expect(logged.map((error) => error.message), `${kind} ${at}`).toEqual([errorOf(kind).message]);
      }
    }
  });

  it("expose: \"coded\" keeps a coded error and a plain Error with a known code", async () => {
    const { call, logged } = await start({ expose: "coded" });
    expect(await call("coded")).toMatchObject({ code: "NOT_FOUND", text: "No user has the id u1", retryable: false });
    expect(await call("conflict")).toMatchObject({ code: "CONFLICT", text: "The row changed", retryable: true });
    expect(logged).toEqual([]);
  });

  it("the last-resort catch sends the raw message without a policy, as before", async () => {
    const { call } = await start(undefined, () => {
      throw new Error(MONGO_MESSAGE);
    });
    expect(await call("coded")).toMatchObject({ code: "INTERNAL_ERROR", text: MONGO_MESSAGE });
  });

  it('the last-resort catch sends "internal error" under "coded" when handle() throws, and logs the real error one time', async () => {
    const { call, logged } = await start({ expose: "coded" }, () => {
      throw new Error(MONGO_MESSAGE);
    });
    const seen = await call("coded");
    expect(seen).toMatchObject({ code: "INTERNAL_ERROR", text: "internal error", retryable: false });
    expect(logged.map((error) => error.message)).toEqual([MONGO_MESSAGE]);
  });

  it("map runs first, and its result goes out as it is", async () => {
    const calls: ErrorCall[] = [];
    const { call } = await start({
      expose: "coded",
      map: (error, at) => {
        calls.push(at);
        return (error as { code?: unknown }).code === 11000 ? { code: "EMAIL_TAKEN", message: "The email is in use" } : undefined;
      },
    });
    expect(await call("mongo")).toMatchObject({ code: "EMAIL_TAKEN", text: "The email is in use" });
    expect(calls).toEqual([{ path: ["test", "fail"], transport: "mcp" }]);
    expect(await call("econnrefused")).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
