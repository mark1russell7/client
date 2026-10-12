/**
 * The program store (roadmap 3.2): programs of procedure.define that outlive the process.
 */

export type { ProgramStore, StoredProgram } from "./types.js";
export { checkStoredProgram } from "./types.js";
export { MemoryProgramStore } from "./memory.js";
export { FileProgramStore } from "./file.js";
export { CollectionProgramStore } from "./collection.js";
export { attachProgramStore, detachProgramStore, getProgramStore } from "./attach.js";
export {
  procedureStoreProcedure,
  procedureLoadProcedure,
  procedureSyncProcedure,
  procedureRemoteProcedure,
  programStoreProcedures,
} from "./procedures.js";
