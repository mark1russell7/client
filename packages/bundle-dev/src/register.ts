/**
 * Bundle Registration for dev workflow
 *
 * Imports client packages which triggers auto-registration of their procedures.
 * This file has side effects - importing it registers all procedures. The modules of the same
 * packages, with no side effects, are in `module.ts`.
 */

// Core infrastructure
import "@mark1russell7/client-shell";
import "@mark1russell7/client-fs";

// CLI wrappers
import "@mark1russell7/client-cli";
import "@mark1russell7/client-pnpm";

// Dev workflow
import "@mark1russell7/client-lib";
import "@mark1russell7/client-git";
import "@mark1russell7/client-dag";
import "@mark1russell7/client-procedure";

export * from "./module.js";
