/**
 * The build of mark runs this module after `tsc -b`: it builds the registry of the workspace
 * (the module of each package, roadmap 3.1) and writes `dist/manifest.json` (see manifest.ts).
 * mark depends on each package that has procedures, so they are built before it.
 */

import { loadEcosystemRegistry } from "./ecosystem.js";
import { manifestPath, writeManifest } from "./manifest.js";

const { registry, loaded } = await loadEcosystemRegistry(false, false);
const manifest = await writeManifest(registry.getAll());
console.log(`mark: ${manifestPath()} has ${manifest.commands.length} commands from ${loaded.length} packages`);
