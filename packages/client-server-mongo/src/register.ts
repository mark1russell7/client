/**
 * Procedure Registration for MongoDB server management
 */

import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { serverMongoStart } from "./procedures/server/start.js";
import { serverMongoStop } from "./procedures/server/stop.js";
import { serverMongoStatus } from "./procedures/server/status.js";
import { serverMongoConnect } from "./procedures/server/connect.js";
import {
  ServerMongoStartInputSchema,
  ServerMongoStopInputSchema,
  ServerMongoStatusInputSchema,
  ServerMongoConnectInputSchema,
  type ServerMongoStartInput,
  type ServerMongoStartOutput,
  type ServerMongoStopInput,
  type ServerMongoStopOutput,
  type ServerMongoStatusInput,
  type ServerMongoStatusOutput,
  type ServerMongoConnectInput,
  type ServerMongoConnectOutput,
} from "./types.js";

const serverMongoStartProcedure = createProcedure()
  .path(["server", "mongo", "start"])
  .input(zodAdapter<ServerMongoStartInput>(ServerMongoStartInputSchema))
  .output(outputSchema<ServerMongoStartOutput>())
  .meta({
    description: "Start MongoDB peer server",
    args: [],
    shorts: { port: "p", host: "h" },
    output: "json",
  })
  .handler(async (input, ctx): Promise<ServerMongoStartOutput> => serverMongoStart(input, ctx))
  .build();

const serverMongoStopProcedure = createProcedure()
  .path(["server", "mongo", "stop"])
  .input(zodAdapter<ServerMongoStopInput>(ServerMongoStopInputSchema))
  .output(outputSchema<ServerMongoStopOutput>())
  .meta({
    description: "Stop MongoDB peer server",
    args: ["serverId"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ServerMongoStopInput): Promise<ServerMongoStopOutput> => serverMongoStop(input))
  .build();

const serverMongoStatusProcedure = createProcedure()
  .path(["server", "mongo", "status"])
  .input(zodAdapter<ServerMongoStatusInput>(ServerMongoStatusInputSchema))
  .output(outputSchema<ServerMongoStatusOutput>())
  .meta({
    description: "Get MongoDB server status",
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ServerMongoStatusInput): Promise<ServerMongoStatusOutput> => serverMongoStatus(input))
  .build();

const serverMongoConnectProcedure = createProcedure()
  .path(["server", "mongo", "connect"])
  .input(zodAdapter<ServerMongoConnectInput>(ServerMongoConnectInputSchema))
  .output(outputSchema<ServerMongoConnectOutput>())
  .meta({
    description: "Connect to MongoDB database",
    args: [],
    shorts: { uri: "u", database: "d" },
    output: "json",
  })
  .handler(async (input: ServerMongoConnectInput): Promise<ServerMongoConnectOutput> => serverMongoConnect(input))
  .build();

export function registerServerMongoProcedures(): void {
  registerProcedures([
    serverMongoStartProcedure,
    serverMongoStopProcedure,
    serverMongoStatusProcedure,
    serverMongoConnectProcedure,
  ]);
}

// Auto-register
registerServerMongoProcedures();
