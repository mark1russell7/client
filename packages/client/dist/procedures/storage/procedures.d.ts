/**
 * Procedure Storage Procedures
 *
 * CLI procedures for managing the procedure registry storage:
 * - procedure.register - Register a procedure at runtime
 * - procedure.store - Persist a procedure to storage
 * - procedure.load - Load procedures from storage
 * - procedure.sync - Sync registry with storage
 * - procedure.remote - Configure remote connection
 */
import type { AnyProcedure } from "../types.js";
export declare const procedureRegisterProcedure: AnyProcedure;
export declare const procedureStoreProcedure: AnyProcedure;
export declare const procedureLoadProcedure: AnyProcedure;
export declare const procedureSyncProcedure: AnyProcedure;
export declare const procedureRemoteProcedure: AnyProcedure;
/**
 * All procedure storage procedures as a module.
 */
export declare const procedureStorageModule: {
    name: string;
    procedures: AnyProcedure[];
};
/**
 * Array of all procedure storage procedures.
 */
export declare const procedureStorageProcedures: AnyProcedure[];
//# sourceMappingURL=procedures.d.ts.map