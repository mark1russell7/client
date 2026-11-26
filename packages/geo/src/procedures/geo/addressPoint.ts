/**
 * geo.addressPoint procedure
 *
 * Find the point of a street address of the United States on its address range (the Census Geocoder)
 */

import { CENSUS_GEOCODER_ATTRIBUTION, censusAddressExchange, censusMatches } from "../../census.js";
import { answerJson, geoSend, type MapDataContext } from "../../polite.js";
import type { GeoAddressPointInput, GeoAddressPointOutput } from "../../types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * This function gives the matches of the Census Geocoder for one street address of the United States.
 * The request is one GET to the geocoder, at the pace of its host. The point of a match is on the address
 * range of the street line, near the road: it is not in the lot. An empty list tells that no range holds the address.
 *
 * @throws Error when the geocoder gives a status other than 200, or an answer that is not an answer of the geocoder.
 */
export async function geoAddressPoint(input: GeoAddressPointInput, context: MapDataContext): Promise<GeoAddressPointOutput> {
  const exchange = censusAddressExchange(input, input.userAgent);
  const reply = await geoSend(context, {
    source: "Census Geocoder",
    what: "the point of the address",
    exchange,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  return { matches: censusMatches(answerJson(reply, "Census Geocoder")), attribution: CENSUS_GEOCODER_ATTRIBUTION };
}
