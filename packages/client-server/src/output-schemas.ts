/**
 * The output schemas of the server.* and manifest.* procedures (roadmap 2.1).
 *
 * Loose objects: a field that a schema does not name stays in the result (a strict schema would
 * remove it when the output is validated). Each schema is a `z.ZodType` of its output type, so
 * the compiler checks it against the type.
 */

import { z } from "zod";
import type {
  ManifestGenerateOutput,
  ServerConnectOutput,
  ServerCreateOutput,
  ServerDisconnectOutput,
  ServerStartOutput,
  ServerStatusOutput,
  ServerStopOutput,
} from "./types.js";
import type { ServerCallOutput } from "./procedures/server.call.js";
import type { ServerConnectionsOutput } from "./procedures/server.connections.js";

const procedureInfo = z.looseObject({
  path: z.array(z.string()).describe("The procedure path"),
  description: z.string().optional().describe("The description of the procedure"),
  inputSchema: z.record(z.string(), z.unknown()).optional().describe("The JSON Schema of the input"),
  outputSchema: z.record(z.string(), z.unknown()).optional().describe("The JSON Schema of the output"),
});

export const ServerCreateOutputSchema: z.ZodType<ServerCreateOutput> = z.looseObject({
  serverId: z.string().describe("The id of the server: server.stop takes it"),
  endpoints: z
    .array(
      z.looseObject({
        type: z.enum(["http", "websocket", "local"]).describe("The transport"),
        address: z.string().describe("The address of the endpoint"),
      })
    )
    .describe("The endpoints of the server"),
  procedureCount: z.number().describe("The number of procedures that the server serves"),
});

export const ServerConnectOutputSchema: z.ZodType<ServerConnectOutput> = z.looseObject({
  connectionId: z.string().describe("The id of the connection: server.call and server.disconnect take it"),
  remotePeerId: z.string().describe("The id of the remote peer"),
  remoteProcedures: z.array(procedureInfo).describe("The procedures of the remote peer"),
});

export const ServerDisconnectOutputSchema: z.ZodType<ServerDisconnectOutput> = z.looseObject({
  success: z.boolean().describe("True when the connection closed"),
});

export const ManifestGenerateOutputSchema: z.ZodType<ManifestGenerateOutput> = z.looseObject({
  json: z
    .looseObject({
      procedures: z.array(procedureInfo).describe("The procedures with their JSON Schemas"),
      generatedAt: z.string().describe("The time of the manifest (ISO 8601)"),
      version: z.string().describe("The version of the manifest format"),
    })
    .optional()
    .describe("The JSON manifest, for the json format"),
  typescript: z.string().optional().describe("The TypeScript declarations, for the typescript format"),
  filesWritten: z.array(z.string()).optional().describe("The files that the call wrote, with outputDir"),
});

export const ServerStartOutputSchema: z.ZodType<ServerStartOutput> = z.looseObject({
  success: z.boolean().describe("True when the server started"),
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

export const ServerCallOutputSchema: z.ZodType<ServerCallOutput> = z.looseObject({
  result: z.unknown().describe("The result of the remote procedure"),
  connectionId: z.string().describe("The connection that the call used"),
  path: z.array(z.string()).describe("The path of the remote procedure"),
});

export const ServerConnectionsOutputSchema: z.ZodType<ServerConnectionsOutput> = z.looseObject({
  connections: z
    .array(
      z.looseObject({
        connectionId: z.string().describe("The id of the connection"),
        remotePeerId: z.string().describe("The id of the remote peer"),
        transport: z.string().describe("The transport of the connection"),
        state: z.string().describe("The state: connecting, connected, disconnected or error"),
        remoteProcedureCount: z.number().describe("The number of procedures of the remote peer"),
        connectedAt: z.string().optional().describe("The time of the connection (ISO 8601)"),
      })
    )
    .describe("The open connections"),
});
