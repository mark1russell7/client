/**
 * geo.distance procedure
 *
 * Give the great-circle distance between two points
 */

import { distanceKm } from "@mark1russell7/geo";
import { EARTH_RADIUS_KM } from "../../distance.js";
import type { GeoDistanceInput, GeoDistanceOutput } from "../../types.js";

/**
 * This function gives the great-circle distance between two points, in kilometres. It changes
 * nothing.
 */
export async function geoDistance(input: GeoDistanceInput): Promise<GeoDistanceOutput> {
  return { km: distanceKm(input.from, input.to, EARTH_RADIUS_KM) };
}
