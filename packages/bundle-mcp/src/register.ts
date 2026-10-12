/**
 * Importing this file registers the procedures of the bundle in the global registry: it imports
 * each package of the bundle (DECISIONS-2026-10, "Every package root registers its procedures").
 * The lists and the modules are in `module.ts`, which registers nothing.
 */

// Core orchestration
import "@procedures/lib";
import "@procedures/procedure";
import "@procedures/cue";

// Infrastructure
import "@procedures/docker";

// Databases
import "@procedures/mongo";
import "@procedures/sqlite";

// Testing
import "@procedures/vitest";

export * from "./module.js";
