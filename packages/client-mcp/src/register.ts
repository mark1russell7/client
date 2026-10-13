/**
 * Importing this file registers the procedures of @procedures/mcp-server, and of the modules that it
 * requires, in the global registry: `import "@procedures/mcp-server/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerMcpProcedures } from "./module.js";

export * from "./module.js";

registerMcpProcedures();
