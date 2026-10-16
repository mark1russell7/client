/**
 * Type definitions of the procedures of this package
 */

import { z } from "zod";
import type { Point } from "./geo.js";
import type { GeohashCell } from "./geohash.js";

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

// =============================================================================
// geo.distance Types - Give the great-circle distance between two points
// =============================================================================

/** The input of `geo.distance`: two points. */
export interface GeoDistanceInput {
  from: Point;
  to: Point;
}

/** The output of `geo.distance`: the great-circle distance in kilometres, without rounding. */
export interface GeoDistanceOutput {
  km: number;
}

export const GeoDistanceInputSchema: z.ZodType<GeoDistanceInput> = z.object({
  from: point.describe("The first point (degrees)"),
  to: point.describe("The second point (degrees)"),
});

export const GeoDistanceOutputSchema: z.ZodType<GeoDistanceOutput> = z.object({
  km: z.number().describe("The great-circle distance in kilometres (haversine, Earth radius 6371 km), without rounding"),
});

// =============================================================================
// geo.geohash Types - Give the geohash of a point
// =============================================================================

/** The input of `geo.geohash`: a point and the number of characters. */
export interface GeoGeohashInput {
  point: Point;
  precision: number;
}

/** The output of `geo.geohash`: the geohash and its cell. */
export interface GeoGeohashOutput {
  hash: string;
  cell: GeohashCell;
}

export const GeoGeohashInputSchema: z.ZodType<GeoGeohashInput, { point: Point; precision?: number | undefined }> = z.object({
  point: point.describe("The point (degrees)"),
  precision: z.number().int().min(1).max(12).default(7).describe("The number of characters, from 1 to 12 (default: 7)"),
});

export const GeoGeohashOutputSchema: z.ZodType<GeoGeohashOutput> = z.object({
  hash: z.string().describe("The geohash"),
  cell: z
    .object({
      south: z.number(),
      west: z.number(),
      north: z.number(),
      east: z.number(),
      center: z.object({ lat: z.number(), lon: z.number() }),
    })
    .describe("The cell of the geohash: its edges and its center (degrees)"),
});
