/**
 * The geohash of a point, and the cell of a geohash. The home of these functions is
 * `@mark1russell7/geo`. This module gives them with their old names until the next MINOR of the
 * client group. Then they go.
 */

import {
  decodeGeohash as geoDecodeGeohash,
  DEFAULT_GEOHASH_PRECISION as GEO_DEFAULT_GEOHASH_PRECISION,
  GEOHASH_ALPHABET as GEO_GEOHASH_ALPHABET,
  geohash as geoGeohash,
  type GeohashCell as GeoGeohashCell,
  MAX_GEOHASH_PRECISION as GEO_MAX_GEOHASH_PRECISION,
} from "@mark1russell7/geo";
import type { Point } from "./geo.js";

/**
 * The base-32 alphabet of the geohash. It has no `a`, `i`, `l` or `o`.
 *
 * @deprecated Use `GEOHASH_ALPHABET` of `@mark1russell7/geo`.
 */
export const GEOHASH_ALPHABET: typeof GEO_GEOHASH_ALPHABET = GEO_GEOHASH_ALPHABET;

/**
 * The precision (number of characters) when the caller gives none.
 *
 * @deprecated Use `DEFAULT_GEOHASH_PRECISION` of `@mark1russell7/geo`.
 */
export const DEFAULT_GEOHASH_PRECISION: typeof GEO_DEFAULT_GEOHASH_PRECISION = GEO_DEFAULT_GEOHASH_PRECISION;

/**
 * The maximum precision. A cell of 12 characters is smaller than 4 cm by 4 cm.
 *
 * @deprecated Use `MAX_GEOHASH_PRECISION` of `@mark1russell7/geo`.
 */
export const MAX_GEOHASH_PRECISION: typeof GEO_MAX_GEOHASH_PRECISION = GEO_MAX_GEOHASH_PRECISION;

/**
 * The cell of a geohash: its edges, in degrees, and its center.
 *
 * @deprecated Use `GeohashCell` of `@mark1russell7/geo`.
 */
export type GeohashCell = GeoGeohashCell;

/**
 * This function gives the geohash of a point, with `geohash` of `@mark1russell7/geo`. It keeps
 * the old check of this package: a longitude out of -180 to 180 throws a `RangeError`. It also
 * throws a `RangeError` for a latitude off the map or a precision out of range.
 *
 * @deprecated Use `geohash` of `@mark1russell7/geo`. That function puts a longitude out of -180
 * to 180 into that range. The old check goes at the next MINOR of the client group.
 */
export const geohash = (point: Point, precision: number = DEFAULT_GEOHASH_PRECISION): string => {
  if (!Number.isFinite(point.lon) || point.lon < -180 || point.lon > 180) {
    throw new RangeError(`The longitude ${point.lon} is not from -180 to 180`);
  }
  return geoGeohash(point, precision);
};

/**
 * This function gives the cell of a geohash, with `decodeGeohash` of `@mark1russell7/geo`. Upper
 * case letters are correct. It keeps the old reading of this package: it puts all of the text in
 * lower case first, so the KELVIN SIGN (U+212A) is a `k`. It throws a `RangeError` for a character
 * that is not in the alphabet.
 *
 * @deprecated Use `decodeGeohash` of `@mark1russell7/geo`. That function refuses each character
 * that is not ASCII. The old reading goes at the next MINOR of the client group.
 */
export const decodeGeohash = (hash: string): GeohashCell => {
  if (hash.length === 0 || hash.length > MAX_GEOHASH_PRECISION) {
    throw new RangeError(`A geohash has 1 to ${MAX_GEOHASH_PRECISION} characters`);
  }
  return geoDecodeGeohash(hash.toLowerCase());
};
