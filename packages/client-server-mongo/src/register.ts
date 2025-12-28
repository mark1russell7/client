/**
 * Procedure Registration for MongoDB server management
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
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

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(data: unknown):
    | { success: true; data: T }
    | { success: false; error: { message: string; errors: Array<{ path: (string | number)[]; message: string }> } };
  _output: T;
}

function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => schema.parse(data),
    safeParse: (data: unknown) => {
      try {
        return { success: true as const, data: schema.parse(data) };
      } catch (error) {
        const err = error as { message?: string; errors?: unknown[] };
        return {
          success: false as const,
          error: {
            message: err.message ?? "Validation failed",
            errors: Array.isArray(err.errors)
              ? err.errors.map((e: unknown) => {
                  const errObj = e as { path?: unknown[]; message?: string };
                  return {
                    path: (errObj.path ?? []) as (string | number)[],
                    message: errObj.message ?? "Unknown error",
                  };
                })
              : [],
          },
        };
      }
    },
    _output: undefined as unknown as T,
  };
}

function outputSchema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}

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
