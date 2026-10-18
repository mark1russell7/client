/**
 * The undo of the changes of items (Graph's split, wave 2, W10). `inversePatch` gives the patch
 * that undoes a patch, and `UndoLog` keeps the undo of each change in a storage.
 */
export { inversePatch } from "./inverse.js";
export { UndoLog, type UndoChange, type UndoEntry, type UndoLogOptions } from "./undo-log.js";
