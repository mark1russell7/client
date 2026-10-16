/**
 * Importing this file registers the procedures of @procedures/ios-backup in the global registry:
 * `import "@procedures/ios-backup/register"`. The package root registers nothing.
 */

import { registerIosBackupProcedures } from "./module.js";

export * from "./module.js";

registerIosBackupProcedures();
