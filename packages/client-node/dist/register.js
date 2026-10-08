/**
 * Procedure Registration for Node.js process management
 */
import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { nodeRun } from "./procedures/node/run.js";
import { nodeSpawn } from "./procedures/node/spawn.js";
import { nodeKill } from "./procedures/node/kill.js";
import { nodeStatus } from "./procedures/node/status.js";
import { NodeRunInputSchema, NodeSpawnInputSchema, NodeKillInputSchema, NodeStatusInputSchema, } from "./types.js";
// Procedure definitions
const nodeRunProcedure = createProcedure()
    .path(["node", "run"])
    .input(zodAdapter(NodeRunInputSchema))
    .output(outputSchema())
    .meta({
    description: "Run a Node.js script and wait for completion",
    args: ["script"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
})
    .handler(async (input) => {
    return nodeRun(input);
})
    .build();
const nodeSpawnProcedure = createProcedure()
    .path(["node", "spawn"])
    .input(zodAdapter(NodeSpawnInputSchema))
    .output(outputSchema())
    .meta({
    description: "Spawn a long-running Node.js process",
    args: ["script"],
    shorts: { cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return nodeSpawn(input);
})
    .build();
const nodeKillProcedure = createProcedure()
    .path(["node", "kill"])
    .input(zodAdapter(NodeKillInputSchema))
    .output(outputSchema())
    .meta({
    description: "Kill a spawned Node.js process",
    args: ["processId"],
    shorts: { signal: "s" },
    output: "json",
})
    .handler(async (input) => {
    return nodeKill(input);
})
    .build();
const nodeStatusProcedure = createProcedure()
    .path(["node", "status"])
    .input(zodAdapter(NodeStatusInputSchema))
    .output(outputSchema())
    .meta({
    description: "Get status of running Node.js processes",
    args: [],
    shorts: {},
    output: "json",
})
    .handler(async (input) => {
    return nodeStatus(input);
})
    .build();
export function registerNodeProcedures() {
    registerProcedures([
        nodeRunProcedure,
        nodeSpawnProcedure,
        nodeKillProcedure,
        nodeStatusProcedure,
    ]);
}
// Auto-register
registerNodeProcedures();
//# sourceMappingURL=register.js.map