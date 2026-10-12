/**
 * Bundle Registration for dev workflow
 *
 * Imports client packages which triggers auto-registration of their procedures.
 * This file has side effects - importing it registers all procedures. The modules of the same
 * packages, with no side effects, are in `module.ts`.
 */

// Core infrastructure
import "@procedures/shell";
import "@procedures/fs";

// CLI wrappers
import "@procedures/cli-run";
import "@procedures/pnpm";

// Dev workflow
import "@procedures/lib";
import "@procedures/git";
import "@procedures/dag";
import "@procedures/procedure";

export * from "./module.js";
