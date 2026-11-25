/**
 * geo.soilAtPoint procedure
 *
 * Give the soil at a point, from the USDA NRCS Soil Data Access service (SSURGO)
 */

import { answerJson, geoSend, type MapDataContext } from "../../polite.js";
import { SSURGO_ATTRIBUTION, soilComponents, soilExchange } from "../../soil.js";
import type { GeoSoilAtPointInput, GeoSoilAtPointOutput } from "../../types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * This function gives the major components of the map unit at a point, with their septic rating,
 * slope, drainage and hydric rating. Soil Data Access takes its SQL query only in the body of a
 * POST, so the request is a POST that only reads. It goes only to the endpoint of Soil Data Access,
 * at the pace of its host. A `fetch` of `createHostFetch()` sends it only when its option
 * `readOnlyPost` names the host `sdmdataaccess.sc.egov.usda.gov`.
 *
 * @throws Error when the service gives a status other than 200, or an answer that is not a table of Soil Data Access.
 */
export async function geoSoilAtPoint(input: GeoSoilAtPointInput, context: MapDataContext): Promise<GeoSoilAtPointOutput> {
  const exchange = soilExchange(input.lon, input.lat, input.userAgent);
  const reply = await geoSend(context, {
    source: "Soil Data Access",
    what: "the soil at the point",
    exchange,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    readOnlyPost: true,
  });
  return { components: soilComponents(answerJson(reply, "Soil Data Access")), attribution: SSURGO_ATTRIBUTION };
}
