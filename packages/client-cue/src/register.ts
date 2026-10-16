/**
 * Importing this file registers the procedures of @procedures/cue, and of the modules that it
 * requires, in the global registry: `import "@procedures/cue/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerCueProcedures } from "./module.js";

export * from "./module.js";

registerCueProcedures();
