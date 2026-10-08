/**
 * @mark1russell7/client-procedure
 *
 * Procedure scaffolding procedures - procedure.new
 */

// Importing the package registers its procedures, as in the other client packages (BUGS-2026-07 H18)
import "./register.js";

// Re-export types
export * from "./types.js";

// Re-export procedures
export { procedureNew } from "./procedures/procedure/index.js";
