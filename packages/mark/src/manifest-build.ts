/**
 * The build of mark runs this module after `tsc -b`: it loads the procedures of the workspace
 * and writes `dist/manifest.json` (see manifest.ts). mark depends on each package that has
 * procedures, so they are built before it.
 */

import { PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { loadEcosystemProcedures } from "./ecosystem.js";
import { manifestPath, writeManifest } from "./manifest.js";

const loaded = await loadEcosystemProcedures(false, false);
const manifest = await writeManifest(PROCEDURE_REGISTRY.getAll());
console.log(`mark: ${manifestPath()} has ${manifest.commands.length} commands from ${loaded.length} packages`);
