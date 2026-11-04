/**
 * The undo of the changes of items. `inversePatch` gives the patch
 * that undoes a patch, and `UndoLog` keeps the undo of each change in a storage.
 */
export { inversePatch } from "./inverse.js";
export { fingerprintOf, UndoConflictError, UndoLog, type UndoChange, type UndoEntry, type UndoLogOptions } from "./undo-log.js";
