/**
 * The logger of the host (roadmap CLI-87).
 *
 * - Without a logger, the lines of the faces go to the console as before.
 * - With `logger`, the server, each face and each transport write to it, and the console gets no call.
 * - `onError` of the server gets the logger of the host.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRegistry, type LogFields, type Logger, type LogLevel, type ServerErrorContext } from "@procedures/client";
import { createProcedureHost, type ProcedureHost } from "./index.js";

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
  return [
    vi.spyOn(console, "debug").mockImplementation(() => undefined),
    vi.spyOn(console, "log").mockImplementation(() => undefined),
    vi.spyOn(console, "info").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "error").mockImplementation(() => undefined),
  ] as const;
}

let hosts: ProcedureHost[] = [];
afterEach(async () => {
  for (const host of hosts) for (const part of [...host.parts].reverse()) await part.impl.close();
  hosts = [];
  vi.restoreAllMocks();
});

/** A host with the faces HTTP and WebSocket and no listener. */
function hostOf(options: Parameters<typeof createProcedureHost>[0] = {}): ProcedureHost {
  const host = createProcedureHost({ registry: createRegistry(), faces: { http: true, ws: true }, ...options });
  hosts.push(host);
  return host;
}

describe("the logger of a host (CLI-87)", () => {
  it("leaves the lines of the faces on the console as before without a logger", () => {
    const [, log] = spyConsole();
    const host = hostOf();
    expect(host.server.logger).toBeUndefined();
    expect(log.mock.calls).toEqual([["[websocket] WebSocket server listening on /ws"]]);
  });

  it("gives its logger to the server and to each face, and the console gets no call", () => {
    const spies = spyConsole();
    const logger = recordingLogger();
    const host = hostOf({ logger });
    expect(host.server.logger).toBe(logger);
    expect(logger.lines).toEqual([{ level: "info", message: "WebSocket server listening", fields: { transport: "websocket", path: "/ws" } }]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("gives its logger to a face factory", () => {
    const logger = recordingLogger();
    const seen: Array<Logger | undefined> = [];
    hostOf({
      logger,
      faces: {
        probe: (context) => {
          seen.push(context.logger, context.handler.logger);
          return {};
        },
      },
    });
    expect(seen).toEqual([logger, logger]);
  });

  it("gives its logger to onError of the server, and logs the error to it too", () => {
    const spies = spyConsole();
    const logger = recordingLogger();
    const contexts: ServerErrorContext[] = [];
    const host = hostOf({ logger, serverOptions: { errors: { expose: "coded" }, onError: (_error, _request, context) => contexts.push(context) } });
    host.server.exposeError(new Error("the socket broke"), undefined, { code: "INTERNAL_ERROR", message: "the socket broke" });
    expect(contexts.map((context) => context.logger)).toEqual([logger]);
    expect(logger.lines.map((line) => line.message)).toContain("The error policy hid an error");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("puts the logger of the host before the logger of the server options", () => {
    const own = recordingLogger();
    const ofServer = recordingLogger();
    const host = hostOf({ logger: own, serverOptions: { logger: ofServer } });
    expect(host.server.logger).toBe(own);
  });
});
