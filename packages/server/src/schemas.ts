/**
 * The input and output schemas of `server.start`, `server.stop` and `server.status`.
 *
 * The three procedures came from `@procedures/peer`: they manage the background server of the
 * `mark` CLI, and this package holds the host. The input schemas validate each field, so the
 * help of `mark server start` lists the options, and the port "abc" fails before the
 * handler. The output schemas are loose objects: a field that a schema does not name stays in
 * the result.
 */

import { z } from "zod";
import { type ZodLikeSchema } from "@procedures/client";
import type {
  ServerStartInput,
  ServerStartOutput,
  ServerStatusInput,
  ServerStatusOutput,
  ServerStopInput,
  ServerStopOutput,
} from "./types.js";

const port = z.number().int().min(1).max(65535);

export const serverStartInputSchema: ZodLikeSchema<ServerStartInput> = z.object({
    port: port.optional().describe("The port to listen on (default: 3000)"),
    host: z.string().min(1).optional().describe("The host to bind to (default: 127.0.0.1)"),
    transport: z.enum(["http", "websocket", "both"]).optional().describe("The transport (default: http)"),
    timeout: z.number().int().min(1).max(600_000).optional().describe("The time to wait for the readiness of the server, in milliseconds (default: 15000)"),
  });

export const serverStopInputSchema: ZodLikeSchema<ServerStopInput> = z.object({
    port: port.optional().describe("The port of the server to stop (default: all servers)"),
    force: z.boolean().optional().describe("Stop with SIGKILL instead of SIGTERM"),
  });

export const serverStatusInputSchema: ZodLikeSchema<ServerStatusInput> = z.object({
    port: port.optional().describe("The port of the server (default: all servers)"),
  });

export const ServerStartOutputSchema: z.ZodType<ServerStartOutput> = z.looseObject({
  success: z.boolean().describe("True when the server is ready. A start that is not ready at the timeout gives false, with the PID (CLI-9)"),
  pid: z.number().optional().describe("The process id of the server"),
  port: z.number().optional().describe("The port of the server"),
  endpoint: z.string().optional().describe("The URL of the server"),
  logFile: z.string().optional().describe("The log file of the server"),
  message: z.string().describe("A message about the result"),
});

export const ServerStopOutputSchema: z.ZodType<ServerStopOutput> = z.looseObject({
  success: z.boolean().describe("True when the server stopped"),
  message: z.string().describe("A message about the result"),
});

export const ServerStatusOutputSchema: z.ZodType<ServerStatusOutput> = z.looseObject({
  running: z.boolean().describe("True when a server runs"),
  pid: z.number().optional().describe("The process id of the server"),
  port: z.number().optional().describe("The port of the server"),
  endpoint: z.string().optional().describe("The URL of the server"),
  transport: z.string().optional().describe("The transport of the server"),
  startedAt: z.string().optional().describe("The start time (ISO 8601)"),
  uptime: z.string().optional().describe("The time since the start, as text"),
  logFile: z.string().optional().describe("The log file of the server"),
  message: z.string().describe("A message about the result"),
});
