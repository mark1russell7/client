/**
 * The log of the failures of a server, under each error policy (CLI-80, CLI-87):
 *
 * - A failure of a procedure goes to `onError` and to the logger one time, also under the default
 *   policy `"all"`, where the caller gets the real message.
 * - A refusal with a known code goes to no log. A code of `codes` is not a failure.
 * - The end of a stream with a failure goes to the log one time.
 * - Under `"coded"`, a hidden failure keeps the line of the policy. A `map` result is the decision
 *   of the host, and goes to no log. A failure that `map` gives back to `expose` goes to the log.
 * - Without `onError` and a logger, the console gets no line for a failure that the caller sees.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import type { LogFields, Logger, LogLevel } from "../logger.js";
import { ProcedureServer } from "./procedure-server.js";
import { Server, type ServerOptions } from "./server.js";
import { pathToMethod } from "./method.js";
import type { ServerRequest, ServerResponse } from "./types.js";

const EFFECTS = { reads: [], writes: [] };

/** The cause of the failure of `notes.crash`: the log keeps it. */
const CAUSE = new Error("the row has no owner");

/** An error with a code, as a driver or an application throws it. */
function coded(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/** The procedures: a crash, a refusal of the input, two codes, and a stream that breaks after one item. */
const registry = createRegistry({
  name: "failure-log",
  procedures: [
    createProcedure()
      .path(["notes", "crash"])
      .input(z.object({}))
      .output(z.string())
      .meta({ effects: EFFECTS })
      .handler(async () => {
        throw new TypeError("x is undefined", { cause: CAUSE });
      })
      .build(),
    createProcedure().path(["notes", "get"]).input(z.object({ id: z.string() })).output(z.string()).meta({ effects: EFFECTS }).handler(async () => "a note").build(),
    createProcedure()
      .path(["notes", "quota"])
      .input(z.object({}))
      .output(z.string())
      .meta({ effects: EFFECTS })
      .handler(async () => {
        throw coded("the quota is used", "QUOTA_EXCEEDED");
      })
      .build(),
    createProcedure()
      .path(["notes", "connect"])
      .input(z.object({}))
      .output(z.string())
      .meta({ effects: EFFECTS })
      .handler(async () => {
        throw coded("connect ECONNREFUSED", "ECONNREFUSED");
      })
      .build(),
    createProcedure()
      .path(["notes", "watch"])
      .input(z.object({}))
      .output(z.string())
      .meta({ effects: EFFECTS })
      .handler((async () =>
        (async function* () {
          yield "row 1";
          throw new Error("the cursor broke");
        })()) as never)
      .build(),
  ],
});

interface Line {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: LogFields;
}

/** A logger that keeps its lines. */
function recordingLogger(): Logger & { readonly lines: Line[] } {
  const lines: Line[] = [];
  return { lines, log: (level, message, fields) => lines.push({ level, message, fields }) };
}

/** A server of the procedures, with a recording logger and an `onError` that keeps each error. */
function serverOf(options: Pick<ServerOptions, "errors"> & { readonly log?: boolean } = {}) {
  const errors: Error[] = [];
  const logger = recordingLogger();
  const server = new ProcedureServer({
    registry,
    autoRegister: true,
    ...(options.errors ? { errors: options.errors } : {}),
    ...(options.log === false ? {} : { logger, onError: (error: Error) => errors.push(error) }),
  });
  return { server, errors, logger };
}

let sent = 0;
/** A request of a procedure. */
function requestOf(path: string[], payload: unknown = {}): ServerRequest<unknown> {
  sent++;
  return { id: `req-${sent}`, method: pathToMethod(path), payload, metadata: {} };
}

/** The response of a call. */
function call(server: Server, path: string[], payload: unknown = {}): Promise<ServerResponse<unknown>> {
  return server.handle(requestOf(path, payload));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the log of the failures of a server", () => {
  it("gives a failure of a procedure to onError and to the logger one time under the default policy", async () => {
    const { server, errors, logger } = serverOf();
    const request = requestOf(["notes", "crash"]);
    const response = await server.handle(request);
    expect(response.status).toMatchObject({ type: "error", code: "HANDLER_ERROR", message: "x is undefined" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
    expect(errors[0]!.cause).toBe(CAUSE);
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]).toMatchObject({ level: "error", message: "A handler failed", fields: { requestId: request.id, procedure: "notes.crash" } });
    expect(logger.lines[0]!.fields["error"]).toBe(errors[0]);
  });

  it("gives a refusal with a known code to no log", async () => {
    const { server, errors, logger } = serverOf();
    const response = await call(server, ["notes", "get"], {});
    expect(response.status).toMatchObject({ type: "error", code: "VALIDATION_ERROR" });
    expect(errors).toEqual([]);
    expect(logger.lines).toEqual([]);
  });

  it("gives no log for a code of codes, and one log for a code that is not known", async () => {
    const { server, errors } = serverOf({ errors: { codes: ["QUOTA_EXCEEDED"] } });
    expect((await call(server, ["notes", "quota"])).status).toMatchObject({ type: "error", code: "QUOTA_EXCEEDED" });
    expect(errors).toEqual([]);
    expect((await call(server, ["notes", "connect"])).status).toMatchObject({ type: "error", code: "ECONNREFUSED" });
    expect(errors.map((error) => error.message)).toEqual(["connect ECONNREFUSED"]);
  });

  it("gives the end of a stream with a failure to the log one time", async () => {
    const { server, errors, logger } = serverOf();
    const response = await call(server, ["notes", "watch"]);
    const reader = response.stream![Symbol.asyncIterator]();
    expect(await reader.next()).toEqual({ done: false, value: "row 1" });
    await expect(reader.next()).rejects.toThrow("the cursor broke");
    expect(errors.map((error) => error.message)).toEqual(["the cursor broke"]);
    expect(logger.lines.map((line) => line.message)).toEqual(["A handler failed"]);
  });

  it("keeps the line of the policy for a failure that coded hides, one time", async () => {
    const { server, errors, logger } = serverOf({ errors: { expose: "coded" } });
    const response = await call(server, ["notes", "crash"]);
    expect(response.status).toMatchObject({ type: "error", code: "INTERNAL_ERROR", message: "internal error" });
    expect(errors.map((error) => error.message)).toEqual(["x is undefined"]);
    expect(logger.lines.map((line) => line.message)).toEqual(["The error policy hid an error"]);
  });

  it("gives a map result to no log, and a failure that map gives back to expose to the log one time", async () => {
    const map = (error: unknown) => ((error as Error).message === "x is undefined" ? { code: "UNAVAILABLE", message: "try again later", retryable: true } : undefined);
    const { server, errors } = serverOf({ errors: { map } });
    expect((await call(server, ["notes", "crash"])).status).toMatchObject({ type: "error", code: "UNAVAILABLE", message: "try again later" });
    expect(errors).toEqual([]);
    expect((await call(server, ["notes", "connect"])).status).toMatchObject({ type: "error", code: "ECONNREFUSED" });
    expect(errors.map((error) => error.message)).toEqual(["connect ECONNREFUSED"]);
  });

  it("gives an error of a face after handle() to the log one time", () => {
    const { server, errors, logger } = serverOf();
    const broke = new Error("the socket broke");
    const exposed = server.exposeError(broke, requestOf(["notes", "crash"]), { code: "INTERNAL_ERROR", message: "the socket broke" });
    expect(exposed).toMatchObject({ code: "INTERNAL_ERROR", message: "the socket broke" });
    expect(errors).toEqual([broke]);
    expect(logger.lines.map((line) => line.message)).toEqual(["A handler failed"]);
  });

  it("gives an error that a handler of register() throws to the log one time", async () => {
    const errors: Error[] = [];
    const logger = recordingLogger();
    const server = new Server({ logger, onError: (error) => errors.push(error) });
    server.register({ service: "notes", operation: "get" }, async () => {
      throw new Error("the disk is full");
    });
    await server.handle({ id: "req-r", method: { service: "notes", operation: "get" }, payload: {}, metadata: {} });
    expect(errors.map((error) => error.message)).toEqual(["the disk is full"]);
    expect(logger.lines.map((line) => line.message)).toEqual(["A handler failed"]);
  });

  it("writes no console line for a failure that the caller sees, without onError and a logger", async () => {
    const spies = [vi.spyOn(console, "error").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined), vi.spyOn(console, "log").mockImplementation(() => undefined)];
    const { server } = serverOf({ log: false });
    const response = await call(server, ["notes", "crash"]);
    expect(response.status).toMatchObject({ type: "error", code: "HANDLER_ERROR" });
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
  });
});
