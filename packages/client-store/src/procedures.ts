/**
 * Every procedure of the package: procedure.register (the synced registry) and the procedures of
 * the program store (procedure.store, load, sync and remote).
 */

import type { AnyProcedure } from "@mark1russell7/client";
import { procedureRegisterProcedure } from "./storage/procedures.js";
import { programStoreProcedures } from "./program-store/procedures.js";

/** All the procedures of client-store. */
export const procedureStorageProcedures: AnyProcedure[] = [procedureRegisterProcedure, ...programStoreProcedures];

/** All the procedures of client-store as a module. */
export const procedureStorageModule: { name: string; procedures: AnyProcedure[] } = {
  name: "procedure-storage",
  procedures: procedureStorageProcedures,
};
