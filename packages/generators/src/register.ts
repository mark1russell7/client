/**
 * Importing this file registers the procedures of @procedures/generators in the global registry:
 * `import "@procedures/generators/register"`. The package root registers nothing.
 */

import { registerGeneratorsProcedures } from "./module.js";

export * from "./module.js";

registerGeneratorsProcedures();
