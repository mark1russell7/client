/**
 * geo.osmFeatures procedure
 *
 * Give the features of OpenStreetMap in a box, through the Overpass API
 */

import { send } from "polite-crawler/api";
import { osmFeatures, overpassExchange, overpassQuery } from "../../features.js";
import { answerJson, geoTransport, type MapDataContext } from "../../polite.js";
import type { GeoOsmFeaturesInput, GeoOsmFeaturesOutput } from "../../types.js";

/** The time limit of the query on the server, in seconds, when the input has none. */
const DEFAULT_TIMEOUT_SECONDS = 60;

/** The transport waits this long after the time limit of the server, so the server can give its own error. */
const TRANSPORT_MARGIN_MS = 30_000;

/**
 * This function gives the features of OpenStreetMap that the selectors select in a box. It sends
 * one Overpass query at the pace of the host of the server.
 */
export async function geoOsmFeatures(input: GeoOsmFeaturesInput, context: MapDataContext): Promise<GeoOsmFeaturesOutput> {
  const timeoutSeconds = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const exchange = overpassExchange(overpassQuery(input.bbox, input.selectors, timeoutSeconds), input.userAgent, input.baseUrl);
  const { reply } = await send(
    context.pace,
    geoTransport(context.fetch, timeoutSeconds * 1000 + TRANSPORT_MARGIN_MS),
    { source: "Overpass API", host: new URL(exchange.url).host, what: "the OpenStreetMap features of a box", exchange },
    context.signal
  );
  return osmFeatures(answerJson(reply, "Overpass API"));
}
