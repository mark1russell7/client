/**
 * The great-circle distance between two points: the haversine formula on a sphere with the mean
 * radius of the Earth. It uses no network.
 */

import type { Point } from "./geo.js";

/** The mean radius of the Earth, in kilometres (IUGG). */
export const EARTH_RADIUS_KM = 6371;

/**
 * This function gives the great-circle distance between two points, in kilometres, without
 * rounding. The formula is the haversine formula on a sphere of `EARTH_RADIUS_KM`. The road
 * distance is longer.
 */
export const greatCircleKm = (a: Point, b: Point): number => {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  // For two antipodal points, a rounding error can make h a little more than 1, and asin of that is NaN
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};
