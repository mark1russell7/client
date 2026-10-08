/**
 * client-node - Node.js process management procedures
 */

// Importing the package registers its procedures, as in the other client packages (BUGS-2026-07 H18)
import "./register.js";

// Export types
export * from "./types.js";

// Export procedures
export { nodeRun } from "./procedures/node/run.js";
export { nodeSpawn } from "./procedures/node/spawn.js";
export { nodeKill } from "./procedures/node/kill.js";
export { nodeStatus } from "./procedures/node/status.js";

// Export process manager
export { processManager } from "./process-manager.js";
