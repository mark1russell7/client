/**
 * geo.distance procedure
 *
 * Give the great-circle distance between two points
 */

import { greatCircleKm } from "../../distance.js";
import type { GeoDistanceInput, GeoDistanceOutput } from "../../types.js";

/**
 * This function gives the great-circle distance between two points, in kilometres. It changes
 * nothing.
 */
export async function geoDistance(input: GeoDistanceInput): Promise<GeoDistanceOutput> {
  return { km: greatCircleKm(input.from, input.to) };
}
