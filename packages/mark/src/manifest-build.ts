/**
 * The build of mark runs this module after `tsc -b`: it builds the registry of the workspace
 * (the module of each package, roadmap 3.1) and writes `dist/manifest.json` (see manifest.ts).
 * mark depends on each package that has procedures, so they are built before it.
 */

import { loadEcosystemRegistry } from "./ecosystem.js";
import { manifestPath, writeManifest } from "./manifest.js";

const { registry, loaded, index } = await loadEcosystemRegistry(false, false);
// Each command records the packages of its path: the lazy registry of a run loads only those (roadmap O93)
const manifest = await writeManifest(registry.getAll(), index);
console.log(`mark: ${manifestPath()} has ${manifest.commands.length} commands from ${loaded.length} packages`);
