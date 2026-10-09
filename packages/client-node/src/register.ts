/**
 * Procedure Registration for Node.js process management
 */

import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
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
  .handler(async (input: NodeRunInput, ctx): Promise<NodeRunOutput> => {
    return nodeRun(input, ctx);
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
