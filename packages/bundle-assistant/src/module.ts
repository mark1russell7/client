/**
 * bundle-assistant - the tools of the personal assistant (roadmap R48), for an MCP host that opts
 * in: `MCP_BUNDLES=@procedures/bundle-mcp,@procedures/bundle-assistant`.
 *
 * The bundle has the procedures of `ics`, `mail`, `geo`, `weather` and `exif`. The tools are only
 * the procedures that are pure, or that read a fixed public service:
 *
 * - `ics.parse`, `ics.occurrences`, `ics.write`, `mail.parse`, `geo.distance`, `geo.distanceKm`,
 *   `geo.geohash`: pure. `geo.distance` is deprecated, and `geo.distanceKm` replaces it.
 * - `geo.geocode`, `geo.route`, `geo.soilAtPoint`, `weather.forecast`: they read one public service each.
 * - `exif.read`: it reads a file of the host.
 *
 * These procedures are not tools:
 *
 * - `ics.fetch` fetches any URL, so a tool call can carry data out in the URL.
 * - `geo.arcgisFeatures` reads a layer of any host, for the same reason. `geo.osmFeatures` can give
 *   megabytes of features for one box, which is too large for a tool result.
 * - `mail.headers` reads a private mailbox.
 * - The other generated procedures of `geo` (`geoManifest`). Each one is pure, but each tool costs
 *   approximately 386 tokens in the tool list of each session. The tool search of the direction 40 decides them.
 * - `notify.send` (not in the bundle) posts to any topic of a public server.
 * - `restic.run` and `tailscale.run` (not in the bundle) run destructive commands.
 *
 * The request of `weather.forecast` goes through the default host policy of `@procedures/http`.
 * The policy refuses a `baseUrl` on a loopback, private or link-local address (audit pass 2, O55).
 * `mcpHostModules` gives `geo` and `ics` with the same policy, for an MCP host. The `fetch` of `geo`
 * also sends the POST of `geo.soilAtPoint`, and only to the host of Soil Data Access.
 * That service takes its query only in the body of a POST, and the query only reads.
 *
 * This file has no side effects: an MCP host builds its own registry from `bundleAssistantModules`.
 * `register.ts` registers the same modules in the global registry.
 */

import { definePackage, pathToKey, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { createHostFetch } from "@procedures/http";
import icsModule, { createIcsModule } from "@procedures/ics/module";
import mailModule from "@procedures/mail/module";
import geoModule, { createGeoModule, geoManifest } from "@procedures/geo/module";
import { SOIL_DATA_ACCESS_HOST } from "@procedures/geo";
import weatherModule from "@procedures/weather/module";
import exifModule from "@procedures/exif/module";

/** The modules of the bundle, for `createRegistry()`. Importing this file registers nothing. */
export const bundleAssistantModules: readonly ProcedureModule[] = [icsModule, mailModule, geoModule, weatherModule, exifModule];

/** The `fetch` of `mcpHostModules`: the default host policy of `@procedures/http`. */
const hostFetch = createHostFetch();

/** The `fetch` of `geo` in `mcpHostModules`: the default host policy, and a POST that only reads to the one host of `geo.soilAtPoint`. */
const geoHostFetch = createHostFetch({ readOnlyPost: [SOIL_DATA_ACCESS_HOST] });

/**
 * The modules of `geo` and `ics` with the default host policy of `@procedures/http`, for an MCP
 * host. The host gives them to `createRegistry()` before the bundle. In one call, the first
 * module of a name counts, so they replace the default modules of `geo` and `ics`.
 *
 * The bundle keeps the default modules. A registry with the default modules (`mark`, the site)
 * refuses a second copy of a procedure with another handler.
 */
export const mcpHostModules: readonly ProcedureModule[] = [createIcsModule({ fetch: hostFetch }), createGeoModule({ fetch: geoHostFetch })];

const bundleAssistantPackage: PackageDefinition = definePackage("@procedures/bundle-assistant", [], bundleAssistantModules);

/** The bundle as one module: no procedures of its own, and the modules above as requirements. */
export const bundleAssistantModule: ProcedureModule = bundleAssistantPackage.module;

export default bundleAssistantModule;

/** The namespaces whose procedures the MCP server gives to Claude as tools. */
export const mcpNamespaces: readonly string[] = ["exif", "geo", "ics", "mail", "weather"];

/**
 * The generated procedures of `geo` that are tools. `geo.distanceKm` replaces the deprecated
 * `geo.distance`, so a host can move to it before the removal.
 */
const geoGeneratedTools: ReadonlySet<string> = new Set(["geo.distanceKm"]);

/**
 * The procedures of those namespaces that are not tools (see the comment of this file). The other
 * generated procedures of `geo` come from `geoManifest`, so a new function of the home is not a tool.
 */
export const mcpExclude: readonly string[] = [
  "ics.fetch",
  "mail.headers",
  "geo.arcgisFeatures",
  "geo.osmFeatures",
  ...geoManifest.procedures.map((procedure) => pathToKey(procedure.path)).filter((key) => !geoGeneratedTools.has(key)),
];

/**
 * This function registers the procedures of @procedures/bundle-assistant, and of the modules that
 * it requires, in a registry. The default is the global registry.
 */
export const registerBundleAssistantProcedures: PackageDefinition["register"] = bundleAssistantPackage.register;
