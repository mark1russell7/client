/**
 * client-vite - Vite dev server management procedures
 */

// Importing the package registers its procedures, as in the other client packages (BUGS-2026-07 H18)
import "./register.js";

export * from "./types.js";
export * from "./procedures/vite/index.js";
export { serverManager } from "./server-manager.js";
