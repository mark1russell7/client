/**
 * Module (no side effects): the procedures of client-store as data, for `createRegistry()`.
 *
 * The procedures of the store: `procedure.register` and the program store procedures
 * `procedure.store`, `load`, `sync` and `remote`. The core registered the older versions of them
 * before they moved here (roadmap 3.2).
 */

import { defineModule, type ProcedureModule } from "@mark1russell7/client";
import { procedureStorageProcedures } from "./procedures.js";

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const storeModule: ProcedureModule = defineModule("@mark1russell7/client-store", procedureStorageProcedures);

export default storeModule;
