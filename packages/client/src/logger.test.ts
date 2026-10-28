/**
 * The logger port of the server side (roadmap CLI-87).
 *
 * - Without a logger, each line goes to the console with the same method and the same arguments as before.
 * - With a logger, the logger gets each line, and the console gets no call.
 * - `onError` gets the logger of the server as its third argument.
 * - The `Logger` of `@mark1russell7/service` is assignable to the port, and the port to it.
 */

import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Logger as RunnerLogger } from "@mark1russell7/service";
import { CONSOLE_LOGGER, writeLog, type LogFields, type Logger, type LogLevel } from "./logger.js";
import { Server, type ServerErrorContext } from "./server/server.js";
import type { ServerRequest } from "./server/types.js";
import { upgradeHandler } from "./adapters/websocket/server/upgrade.js";
import { StreamSequence } from "./adapters/sequence.js";

/** A log line, as the recording logger keeps it. */
interface Line {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: LogFields;
}

/** A logger that records each line. */
function recordingLogger(): Logger & { readonly lines: Line[] } {
  const lines: Line[] = [];
  return { lines, log: (level, message, fields) => lines.push({ level, message, fields }) };
}

/** Spies on each console method that a line can use. Each spy writes nothing. */
function spyConsole() {
  return {
    debug: vi.spyOn(console, "debug").mockImplementation(() => undefined),
    log: vi.spyOn(console, "log").mockImplementation(() => undefined),
    info: vi.spyOn(console, "info").mockImplementation(() => undefined),
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

/** The number of calls of all console spies. */
function consoleCalls(spies: ReturnType<typeof spyConsole>): number {
  return Object.values(spies).reduce((sum, spy) => sum + spy.mock.calls.length, 0);
}

/** A request of the test. */
const REQUEST: ServerRequest = { id: "req-1", method: { service: "notes", operation: "get" }, payload: {}, metadata: {}, transport: "http" };

/** A server whose error policy hides the message of a plain error. */
function hidingServer(options: ConstructorParameters<typeof Server>[0] = {}): Server {
  const server = new Server({ errors: { expose: "coded" }, ...options });
  server.register({ service: "notes", operation: "get" }, async () => {
    throw new Error("the disk is full");
  });
  return server;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the type of the port", () => {
  it("is the shape of the Logger of the runner, in the two directions", () => {
    expectTypeOf<RunnerLogger>().toExtend<Logger>();
    expectTypeOf<Logger>().toExtend<RunnerLogger>();
  });
});

describe("writeLog()", () => {
  it("gives the console the arguments of the line without a logger", () => {
    const spies = spyConsole();
    writeLog(undefined, "info", "Server stopped", { transport: "http" }, "[http] Server stopped");
    writeLog(undefined, "error", "Connection error", { error: 1 }, "[WebSocket] Connection error:", 1);
    writeLog(undefined, "debug", "A report", {}, "[ProcedureServer] a report");
    writeLog(undefined, "warn", "Frames lost", {}, "[stream] lost");
    expect(spies.log.mock.calls).toEqual([["[http] Server stopped"]]);
    expect(spies.error.mock.calls).toEqual([["[WebSocket] Connection error:", 1]]);
    expect(spies.debug.mock.calls).toEqual([["[ProcedureServer] a report"]]);
    expect(spies.warn.mock.calls).toEqual([["[stream] lost"]]);
    expect(spies.info).not.toHaveBeenCalled();
  });

  it("gives the logger the level, the message and the fields, and the console nothing", () => {
    const spies = spyConsole();
    const logger = recordingLogger();
    writeLog(logger, "warn", "Frames lost", { lost: 2 }, "[stream] lost");
    expect(logger.lines).toEqual([{ level: "warn", message: "Frames lost", fields: { lost: 2 } }]);
    expect(consoleCalls(spies)).toBe(0);
  });
});

describe("CONSOLE_LOGGER", () => {
  it("writes the message and the fields with the console method of the level", () => {
    const spies = spyConsole();
    CONSOLE_LOGGER.log("info", "started", { port: 3000 });
    CONSOLE_LOGGER.log("error", "failed", {});
    expect(spies.log.mock.calls).toEqual([["started", { port: 3000 }]]);
    expect(spies.error.mock.calls).toEqual([["failed"]]);
  });
});

describe("the hidden errors of a server", () => {
  it("go to console.error as before without a logger and without onError", async () => {
    const spies = spyConsole();
    const response = await hidingServer().handle(REQUEST);
    expect(response.status).toMatchObject({ type: "error", code: "INTERNAL_ERROR", message: "internal error" });
    expect(spies.error).toHaveBeenCalledTimes(1);
    const [format, id, error] = spies.error.mock.calls[0]!;
    expect(format).toBe("[Server] hidden error of %s: %o");
    expect(id).toBe("req-1");
    expect((error as Error).message).toBe("the disk is full");
  });

  it("go to the logger with their context in the fields, and the console gets no call", async () => {
    const spies = spyConsole();
    const logger = recordingLogger();
    await hidingServer({ logger }).handle(REQUEST);
    expect(consoleCalls(spies)).toBe(0);
    expect(logger.lines).toHaveLength(1);
    const [line] = logger.lines;
    expect(line).toMatchObject({ level: "error", message: "A handler failed", fields: { requestId: "req-1", procedure: "notes.get", transport: "http" } });
    expect((line!.fields["error"] as Error).message).toBe("the disk is full");
  });

  it("go to onError with the logger of the server, and to the logger too", async () => {
    const spies = spyConsole();
    const logger = recordingLogger();
    const seen: ServerErrorContext[] = [];
    await hidingServer({ logger, onError: (_error, _request, context) => seen.push(context) }).handle(REQUEST);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.logger).toBe(logger);
    expect(logger.lines.map((line) => line.message)).toEqual(["A handler failed"]);
    expect(consoleCalls(spies)).toBe(0);
  });

  it("give onError the console adapter without a logger, and write no console line", async () => {
    const spies = spyConsole();
    const seen: ServerErrorContext[] = [];
    await hidingServer({ onError: (_error, _request, context) => seen.push(context) }).handle(REQUEST);
    expect(seen.map((context) => context.logger)).toEqual([CONSOLE_LOGGER]);
    expect(consoleCalls(spies)).toBe(0);
  });

  it("go to the logger one time from the error policy, for an error of a face", () => {
    const spies = spyConsole();
    const logger = recordingLogger();
    const server = hidingServer({ logger });
    server.exposeError(new Error("the socket broke"), undefined, { code: "INTERNAL_ERROR", message: "the socket broke" });
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]).toMatchObject({ level: "error", message: "The error policy hid an error" });
    expect(consoleCalls(spies)).toBe(0);
  });

  it("gives its logger to the faces", () => {
    const logger = recordingLogger();
    expect(new Server({ logger }).logger).toBe(logger);
    expect(new Server().logger).toBeUndefined();
  });
});

describe("the lines of the WebSocket server transport", () => {
  it("go to console.log as before without a logger", async () => {
    const spies = spyConsole();
    const handler = upgradeHandler(new Server(), { path: "/ws", heartbeat: false });
    await handler.close();
    expect(spies.log.mock.calls).toEqual([["[websocket] WebSocket server listening on /ws"], ["[websocket] WebSocket server stopped"]]);
  });

  it("go to the logger of the server, and the console gets no call", async () => {
    const spies = spyConsole();
    const logger = recordingLogger();
    const handler = upgradeHandler(new Server({ logger }), { path: "/ws", heartbeat: false });
    await handler.close();
    expect(logger.lines).toEqual([
      { level: "info", message: "WebSocket server listening", fields: { transport: "websocket", path: "/ws" } },
      { level: "info", message: "WebSocket server stopped", fields: { transport: "websocket", path: "/ws" } },
    ]);
    expect(consoleCalls(spies)).toBe(0);
  });

  it("go to the logger of the options before the logger of the server", async () => {
    const spies = spyConsole();
    const own = recordingLogger();
    const ofServer = recordingLogger();
    const handler = upgradeHandler(new Server({ logger: ofServer }), { path: "/live", heartbeat: false, logger: own });
    await handler.close();
    expect(own.lines.map((line) => line.message)).toEqual(["WebSocket server listening", "WebSocket server stopped"]);
    expect(ofServer.lines).toEqual([]);
    expect(consoleCalls(spies)).toBe(0);
  });
});

describe("the warning of a stream gap", () => {
  it("goes to console.warn as before without a logger", () => {
    const spies = spyConsole();
    new StreamSequence().next(3, "call-1");
    expect(spies.warn.mock.calls).toEqual([["[stream] Frames lost before seq 3 of the call call-1: 2"]]);
  });

  it("goes to the logger with its fields", () => {
    const spies = spyConsole();
    const logger = recordingLogger();
    new StreamSequence(logger).next(3, "call-1");
    expect(logger.lines).toEqual([{ level: "warn", message: "Frames lost", fields: { requestId: "call-1", seq: 3, lost: 2 } }]);
    expect(consoleCalls(spies)).toBe(0);
  });
});
