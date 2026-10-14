/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for Node.js process management
 */

import { createProcedure, zodAdapter, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
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
  NodeRunOutputSchema,
  NodeSpawnOutputSchema,
  NodeKillOutputSchema,
  NodeStatusOutputSchema,
} from "./types.js";

// Procedure definitions
const nodeRunProcedure = createProcedure()
  .path(["node", "run"])
  .input(zodAdapter<NodeRunInput>(NodeRunInputSchema))
  .output(zodAdapter<NodeRunOutput>(NodeRunOutputSchema))
  .meta({
    description: "Run a Node.js script and wait for completion",
    args: ["script"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
    // The caller chooses the script, and the script can do anything
    effects: { reads: ["process"], writes: ["process"] },
  })
  .handler(async (input: NodeRunInput, ctx): Promise<NodeRunOutput> => {
    return nodeRun(input, ctx);
  })
  .build();

const nodeSpawnProcedure = createProcedure()
  .path(["node", "spawn"])
  .input(zodAdapter<NodeSpawnInput>(NodeSpawnInputSchema))
  .output(zodAdapter<NodeSpawnOutput>(NodeSpawnOutputSchema))
  .meta({
    description: "Spawn a long-running Node.js process",
    args: ["script"],
    shorts: { cwd: "C" },
    output: "json",
    effects: { reads: ["process"], writes: ["process"] },
  })
  .handler(async (input: NodeSpawnInput): Promise<NodeSpawnOutput> => {
    return nodeSpawn(input);
  })
  .build();

const nodeKillProcedure = createProcedure()
  .path(["node", "kill"])
  .input(zodAdapter<NodeKillInput>(NodeKillInputSchema))
  .output(zodAdapter<NodeKillOutput>(NodeKillOutputSchema))
  .meta({
    description: "Kill a spawned Node.js process",
    args: ["processId"],
    shorts: { signal: "s" },
    output: "json",
    // It ends a process of node.spawn. A second call finds the process already ended.
    effects: { reads: ["process"], writes: ["process"], idempotent: true },
  })
  .handler(async (input: NodeKillInput): Promise<NodeKillOutput> => {
    return nodeKill(input);
  })
  .build();

const nodeStatusProcedure = createProcedure()
  .path(["node", "status"])
  .input(zodAdapter<NodeStatusInput>(NodeStatusInputSchema))
  .output(zodAdapter<NodeStatusOutput>(NodeStatusOutputSchema))
  .meta({
    description: "Get status of running Node.js processes",
    args: [],
    shorts: {},
    output: "json",
    // It reads the records of the processes of node.spawn
    effects: { reads: ["process"], writes: [] },
  })
  .handler(async (input: NodeStatusInput): Promise<NodeStatusOutput> => {
    return nodeStatus(input);
  })
  .build();

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const nodeModule: ProcedureModule = defineModule("@procedures/node", [
    nodeRunProcedure,
    nodeSpawnProcedure,
    nodeKillProcedure,
    nodeStatusProcedure,
  ]);

export default nodeModule;

/**
 * This function registers the procedures of @procedures/node, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerNodeProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [nodeModule]);
}
