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
 * The request of `weather.forecast` goes through the default host policy of `@procedures/http`.
 * The policy refuses a `baseUrl` on a loopback, private or link-local address (audit pass 2, O55).
 * `mcpHostModules` gives `geo` and `ics` with the same policy, for an MCP host.
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

/** The modules of the bundle, for `createRegistry()`. Importing this file registers nothing. */
export const bundleAssistantModules: readonly ProcedureModule[] = [icsModule, mailModule, geoModule, weatherModule, exifModule];

/** The `fetch` of `mcpHostModules`: the default host policy of `@procedures/http`. */
const hostFetch = createHostFetch();

/**
 * The modules of `geo` and `ics` with the default host policy of `@procedures/http`, for an MCP
 * host. The host gives them to `createRegistry()` before the bundle. In one call, the first
 * module of a name counts, so they replace the default modules of `geo` and `ics`.
 *
 * The bundle keeps the default modules. A registry with the default modules (`mark`, the site)
 * refuses a second copy of a procedure with another handler.
 */
export const mcpHostModules: readonly ProcedureModule[] = [createIcsModule({ fetch: hostFetch }), createGeoModule({ fetch: hostFetch })];

/** The bundle as one module: no procedures of its own, and the modules above as requirements. */
export const bundleAssistantModule: ProcedureModule = defineModule("@procedures/bundle-assistant", [], bundleAssistantModules);

export default bundleAssistantModule;

/** The namespaces whose procedures the MCP server gives to Claude as tools. */
export const mcpNamespaces: readonly string[] = ["exif", "geo", "ics", "mail", "weather"];

/** The procedures of those namespaces that are not tools (see the comment of this file). */
export const mcpExclude: readonly string[] = ["ics.fetch", "mail.headers"];

/**
 * This function registers the procedures of @procedures/bundle-assistant, and of the modules that
 * it requires, in a registry. The default is the global registry.
 */
export function registerBundleAssistantProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [bundleAssistantModule]);
}
