/**
 * Importing this file registers the procedures of @procedures/snapshot, and of the modules that it
 * requires, in the global registry: `import "@procedures/snapshot/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerSnapshotProcedures } from "./module.js";

export * from "./module.js";

registerSnapshotProcedures();
