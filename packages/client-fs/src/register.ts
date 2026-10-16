/**
 * Importing this file registers the procedures of @procedures/fs, and of the modules that it
 * requires, in the global registry: `import "@procedures/fs/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerFsProcedures } from "./module.js";

export * from "./module.js";

registerFsProcedures();
