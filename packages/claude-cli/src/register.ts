/**
 * An import of this file registers the procedures of @procedures/claude-cli in the global registry:
 * `import "@procedures/claude-cli/register"`. The package root registers nothing.
 */

import { registerClaudeCliProcedures } from "./module.js";

export * from "./module.js";

registerClaudeCliProcedures();
