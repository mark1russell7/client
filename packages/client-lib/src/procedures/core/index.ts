/**
 * Core control-flow procedures that require ProcedureContext
 *
 * These procedures need access to the client for executing procedure refs
 * with proper error handling and control flow.
 */

export { coreCatch } from "./catch.js";
export type { CoreCatchInput, CoreCatchOutput } from "../../types.js";
