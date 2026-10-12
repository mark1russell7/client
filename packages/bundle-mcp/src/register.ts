/**
 * Importing this file registers the procedures of the bundle in the global registry: it imports
 * each package of the bundle (DECISIONS-2026-10, "Every package root registers its procedures").
 * The lists and the modules are in `module.ts`, which registers nothing.
 */

// Core orchestration
import "@mark1russell7/client-lib";
import "@mark1russell7/client-procedure";
import "@mark1russell7/client-cue";

// Infrastructure
import "@mark1russell7/client-docker";

// Databases
import "@mark1russell7/client-mongo";
import "@mark1russell7/client-sqlite";

// Testing
import "@mark1russell7/client-vitest";

export * from "./module.js";
