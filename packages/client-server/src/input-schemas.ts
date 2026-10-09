/**
 * Input schemas of the `server.*` and `manifest.*` procedures.
 *
 * Before, these procedures used pass-through schemas: `mark server start --help` listed no
 * options, and a port such as "abc" reached the handler. Each schema now validates its input,
 * and the CLI help shows the fields.
 */

import { z } from "zod";
import { zodAdapter, type ZodLikeSchema } from "@mark1russell7/client";
import type {
  ManifestGenerateInput,
  ServerConnectInput,
  ServerCreateInput,
  ServerDisconnectInput,
  ServerStartInput,
  ServerStatusInput,
  ServerStopInput,
} from "./types.js";
import type { ServerCallInput } from "./procedures/server.call.js";
import type { ServerConnectionsInput } from "./procedures/server.connections.js";

const port = z.number().int().min(1).max(65535);

const httpTransport = z.object({
  type: z.literal("http"),
  port: port.optional(),
  host: z.string().min(1).optional(),
  basePath: z.string().optional(),
  cors: z.boolean().optional(),
  corsOrigins: z.array(z.string()).optional(),
  urlStrategy: z.enum(["rest", "rpc"]).optional(),
  token: z.string().min(1).optional(),
});

const webSocketTransport = z.object({
  type: z.literal("websocket"),
  port: port.optional(),
  host: z.string().min(1).optional(),
  path: z.string().optional(),
  origins: z.array(z.string()).optional(),
  token: z.string().min(1).optional(),
});

const localTransport = z.object({ type: z.literal("local") });

export const serverCreateInputSchema: ZodLikeSchema<ServerCreateInput> = zodAdapter<ServerCreateInput>(
  z.object({
    transports: z
      .array(z.discriminatedUnion("type", [httpTransport, webSocketTransport, localTransport]))
      .optional()
      .describe("The transports to start (default: HTTP on port 3000)"),
    autoRegister: z.boolean().optional().describe("Serve every procedure of the registry (default: true)"),
    token: z.string().min(1).optional().describe("A secret that every request must send"),
  })
);

export const serverStartInputSchema: ZodLikeSchema<ServerStartInput> = zodAdapter<ServerStartInput>(
  z.object({
    port: port.optional().describe("The port to listen on (default: 3000)"),
    host: z.string().min(1).optional().describe("The host to bind to (default: 127.0.0.1)"),
    transport: z.enum(["http", "websocket", "both"]).optional().describe("The transport (default: http)"),
  })
);

export const serverStopInputSchema: ZodLikeSchema<ServerStopInput> = zodAdapter<ServerStopInput>(
  z.object({
    port: port.optional().describe("The port of the server to stop (default: all servers)"),
    force: z.boolean().optional().describe("Stop with SIGKILL instead of SIGTERM"),
  })
);

export const serverStatusInputSchema: ZodLikeSchema<ServerStatusInput> = zodAdapter<ServerStatusInput>(
  z.object({
    port: port.optional().describe("The port of the server (default: all servers)"),
  })
);

export const serverConnectInputSchema: ZodLikeSchema<ServerConnectInput> = zodAdapter<ServerConnectInput>(
  z.object({
    address: z.string().min(1).describe("The address of the remote peer"),
    transport: z.enum(["http", "websocket", "local"]).optional().describe("The transport to use"),
    timeout: z.number().int().positive().optional().describe("The connection timeout in milliseconds"),
  })
);

export const serverDisconnectInputSchema: ZodLikeSchema<ServerDisconnectInput> = zodAdapter<ServerDisconnectInput>(
  z.object({
    connectionId: z.string().min(1).describe("The connection id from server connect"),
  })
);

export const serverCallInputSchema: ZodLikeSchema<ServerCallInput> = zodAdapter<ServerCallInput>(
  z
    .object({
      connectionId: z.string().min(1).optional().describe("The connection id from server connect"),
      address: z.string().min(1).optional().describe("The address of a peer, for a one-time connection"),
      path: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .describe("The procedure path on the peer: dot-separated text or a list"),
      input: z.unknown().optional().describe("The input of the remote procedure"),
    })
    .refine((input) => input.connectionId !== undefined || input.address !== undefined, {
      message: "Give connectionId or address",
    })
);

export const serverConnectionsInputSchema: ZodLikeSchema<ServerConnectionsInput> =
  zodAdapter<ServerConnectionsInput>(z.object({}));

export const manifestGenerateInputSchema: ZodLikeSchema<ManifestGenerateInput> = zodAdapter<ManifestGenerateInput>(
  z.object({
    formats: z.array(z.enum(["json", "typescript"])).optional().describe("The manifest formats (default: json)"),
    namespace: z.array(z.string()).optional().describe("Only the procedures under this path"),
    outputDir: z.string().optional().describe("The folder for the manifest files"),
  })
);
