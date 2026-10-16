/**
 * Importing this file registers the procedures of @procedures/llm in the global registry:
 * `import "@procedures/llm/register"`. The package root registers nothing.
 */

import { registerLlmProcedures } from "./module.js";

export * from "./module.js";

registerLlmProcedures();
