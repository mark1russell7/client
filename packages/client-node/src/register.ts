/**
 * Procedure Registration for Node.js process management
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { nodeRun } from "./procedures/node/run.js";
import { nodeSpawn } from "./procedures/node/spawn.js";
import { nodeKill } from "./procedures/node/kill.js";
import { nodeStatus } from "./procedures/node/status.js";
import {
  NodeRunInputSchema,
  NodeSpawnInputSchema,
  NodeKillInputSchema,
  NodeStatusInputSchema,
  type NodeRunInput,
  type NodeRunOutput,
  type NodeSpawnInput,
  type NodeSpawnOutput,
  type NodeKillInput,
  type NodeKillOutput,
  type NodeStatusInput,
  type NodeStatusOutput,
} from "./types.js";

// Minimal schema adapter
interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ):
    | { success: true; data: T }
    | {
        success: false;
        error: { message: string; errors: Array<{ path: (string | number)[]; message: string }> };
      };
  _output: T;
}

function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => schema.parse(data),
    safeParse: (data: unknown) => {
      try {
        const parsed = schema.parse(data);
        return { success: true as const, data: parsed };
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

// Procedure definitions
const nodeRunProcedure = createProcedure()
  .path(["node", "run"])
  .input(zodAdapter<NodeRunInput>(NodeRunInputSchema))
  .output(outputSchema<NodeRunOutput>())
  .meta({
    description: "Run a Node.js script and wait for completion",
    args: ["script"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
  })
  .handler(async (input: NodeRunInput): Promise<NodeRunOutput> => {
    return nodeRun(input);
  })
  .build();

const nodeSpawnProcedure = createProcedure()
  .path(["node", "spawn"])
  .input(zodAdapter<NodeSpawnInput>(NodeSpawnInputSchema))
  .output(outputSchema<NodeSpawnOutput>())
  .meta({
    description: "Spawn a long-running Node.js process",
    args: ["script"],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: NodeSpawnInput): Promise<NodeSpawnOutput> => {
    return nodeSpawn(input);
  })
  .build();

const nodeKillProcedure = createProcedure()
  .path(["node", "kill"])
  .input(zodAdapter<NodeKillInput>(NodeKillInputSchema))
  .output(outputSchema<NodeKillOutput>())
  .meta({
    description: "Kill a spawned Node.js process",
    args: ["processId"],
    shorts: { signal: "s" },
    output: "json",
  })
  .handler(async (input: NodeKillInput): Promise<NodeKillOutput> => {
    return nodeKill(input);
  })
  .build();

const nodeStatusProcedure = createProcedure()
  .path(["node", "status"])
  .input(zodAdapter<NodeStatusInput>(NodeStatusInputSchema))
  .output(outputSchema<NodeStatusOutput>())
  .meta({
    description: "Get status of running Node.js processes",
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: NodeStatusInput): Promise<NodeStatusOutput> => {
    return nodeStatus(input);
  })
  .build();

export function registerNodeProcedures(): void {
  registerProcedures([
    nodeRunProcedure,
    nodeSpawnProcedure,
    nodeKillProcedure,
    nodeStatusProcedure,
  ]);
}

// Auto-register
registerNodeProcedures();
