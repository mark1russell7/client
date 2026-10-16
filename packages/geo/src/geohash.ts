/**
 * The geohash of a point, and the cell of a geohash. A geohash interleaves the bits of the
 * longitude and the latitude, and writes five bits as one character of a base-32 alphabet.
 */

import type { Point } from "./geo.js";

/** The base-32 alphabet of the geohash. It has no `a`, `i`, `l` or `o`. */
export const GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

/** The precision (number of characters) when the caller gives none. At the equator, a cell of 7 characters is approximately 153 m by 153 m. */
export const DEFAULT_GEOHASH_PRECISION = 7;

/** The maximum precision. A cell of 12 characters is smaller than 4 cm by 4 cm. */
export const MAX_GEOHASH_PRECISION = 12;

/** The cell of a geohash: its edges, in degrees, and its center. */
export interface GeohashCell {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
  readonly center: Point;
}

const checkPoint = (point: Point): void => {
  if (!Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) throw new RangeError(`The latitude ${point.lat} is not from -90 to 90`);
  if (!Number.isFinite(point.lon) || point.lon < -180 || point.lon > 180) throw new RangeError(`The longitude ${point.lon} is not from -180 to 180`);
};

/**
 * This function gives the geohash of a point. The first bit is the longitude. A coordinate on
 * the middle of a range goes to the upper half.
 */
export const geohash = (point: Point, precision: number = DEFAULT_GEOHASH_PRECISION): string => {
  checkPoint(point);
  if (!Number.isInteger(precision) || precision < 1 || precision > MAX_GEOHASH_PRECISION) {
    throw new RangeError(`The precision ${precision} is not an integer from 1 to ${MAX_GEOHASH_PRECISION}`);
  }
  const latRange = [-90, 90] as [number, number];
  const lonRange = [-180, 180] as [number, number];
  let hash = "";
  let bits = 0;
  let value = 0;
  let evenBit = true;
  while (hash.length < precision) {
    const range = evenBit ? lonRange : latRange;
    const coordinate = evenBit ? point.lon : point.lat;
    const mid = (range[0] + range[1]) / 2;
    if (coordinate >= mid) {
      value = (value << 1) | 1;
      range[0] = mid;
    } else {
      value <<= 1;
      range[1] = mid;
    }
    evenBit = !evenBit;
    bits += 1;
    if (bits === 5) {
      hash += GEOHASH_ALPHABET[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
};

/**
 * This function gives the cell of a geohash: its edges and its center. Upper case letters are
 * correct. It throws a `RangeError` for a character that is not in the alphabet.
 */
export const decodeGeohash = (hash: string): GeohashCell => {
  if (hash.length === 0 || hash.length > MAX_GEOHASH_PRECISION) {
    throw new RangeError(`A geohash has 1 to ${MAX_GEOHASH_PRECISION} characters`);
  }
  const lat = [-90, 90] as [number, number];
  const lon = [-180, 180] as [number, number];
  let evenBit = true;
  for (const char of hash.toLowerCase()) {
    const value = GEOHASH_ALPHABET.indexOf(char);
    if (value === -1) throw new RangeError(`"${char}" is not a character of a geohash`);
    for (let bit = 4; bit >= 0; bit -= 1) {
      const range = evenBit ? lon : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((value >> bit) & 1) range[0] = mid;
      else range[1] = mid;
      evenBit = !evenBit;
    }
  }
  return {
    south: lat[0],
    west: lon[0],
    north: lat[1],
    east: lon[1],
    center: { lat: (lat[0] + lat[1]) / 2, lon: (lon[0] + lon[1]) / 2 },
  };
};
