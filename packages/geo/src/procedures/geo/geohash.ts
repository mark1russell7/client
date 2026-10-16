/**
 * geo.geohash procedure
 *
 * Give the geohash of a point
 */

import { decodeGeohash, geohash } from "../../geohash.js";
import type { GeoGeohashInput, GeoGeohashOutput } from "../../types.js";

/**
 * This function gives the geohash of a point and the cell of that geohash. It changes nothing.
 */
export async function geoGeohash(input: GeoGeohashInput): Promise<GeoGeohashOutput> {
  const hash = geohash(input.point, input.precision);
  return { hash, cell: decodeGeohash(hash) };
}
