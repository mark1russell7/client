/**
 * bundle-assistant - the tools of the personal assistant (roadmap R48), for an MCP host that opts
 * in: `MCP_BUNDLES=@procedures/bundle-mcp,@procedures/bundle-assistant`.
 *
 * The bundle has the procedures of `ics`, `mail`, `geo`, `weather` and `exif`. The tools are only
 * the procedures that are pure, or that read a fixed public service:
 *
 * - `ics.parse`, `ics.occurrences`, `ics.write`, `mail.parse`, `geo.distance`, `geo.geohash`: pure.
 * - `geo.geocode`, `geo.route`, `weather.forecast`: they read one public service each.
 * - `exif.read`: it reads a file of the host.
 *
 * These procedures are not tools:
 *
 * - `ics.fetch` fetches any URL, so a tool call can carry data out in the URL.
 * - `mail.headers` reads a private mailbox.
 * - `notify.send` (not in the bundle) posts to any topic of a public server.
 * - `restic.run` and `tailscale.run` (not in the bundle) run destructive commands.
 *
 * In `bundleAssistantModule`, the requests of `geo.geocode`, `geo.route`, `weather.forecast` and
 * `ics.fetch` go through the default host policy of `@procedures/http`. The policy refuses a
 * `baseUrl` or a feed on a loopback, private or link-local address (audit pass 2, O55).
 *
 * This file has no side effects: an MCP host builds its own registry from `bundleAssistantModules`.
 * `register.ts` registers the same modules in the global registry.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { createHostFetch } from "@procedures/http";
import icsModule, { createIcsModule } from "@procedures/ics/module";
import mailModule from "@procedures/mail/module";
import geoModule, { createGeoModule } from "@procedures/geo/module";
import weatherModule from "@procedures/weather/module";
import exifModule from "@procedures/exif/module";

/** The `fetch` of the network procedures of the bundle: the default host policy of `@procedures/http`. */
const hostFetch = createHostFetch();

/** The modules of the bundle, for `createRegistry()`. Importing this file registers nothing. */
export const bundleAssistantModules: readonly ProcedureModule[] = [
  createIcsModule({ fetch: hostFetch }),
  mailModule,
  createGeoModule({ fetch: hostFetch }),
  // The default module of weather goes through the default host policy
  weatherModule,
  exifModule,
];

/** The bundle as one module: no procedures of its own, and the modules above as requirements. */
export const bundleAssistantModule: ProcedureModule = defineModule("@procedures/bundle-assistant", [], bundleAssistantModules);

export default bundleAssistantModule;

/** The namespaces whose procedures the MCP server gives to Claude as tools. */
export const mcpNamespaces: readonly string[] = ["exif", "geo", "ics", "mail", "weather"];

/** The procedures of those namespaces that are not tools (see the comment of this file). */
export const mcpExclude: readonly string[] = ["ics.fetch", "mail.headers"];

/**
 * The bundle with the default modules of `geo` and `ics`, for the global registry. The register
 * entries of `geo` and `ics` put those modules in the global registry. A second copy of a
 * procedure with another handler is an error, so the global registry gets the same copy.
 */
const globalBundleModule: ProcedureModule = defineModule("@procedures/bundle-assistant", [], [icsModule, mailModule, geoModule, weatherModule, exifModule]);

/**
 * This function registers the procedures of @procedures/bundle-assistant, and of the modules that
 * it requires, in a registry. The default is the global registry.
 *
 * This function gives the default modules of `geo` and `ics`, as their register entries do. These
 * modules use the global `fetch`. For the host policy, give `bundleAssistantModule` to `createRegistry()`.
 */
export function registerBundleAssistantProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [globalBundleModule]);
}
