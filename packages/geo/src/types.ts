/**
 * Type definitions of the procedures of this package
 */

import type { SoilComponent } from "./soil.js";
import * as z from "zod";
import type { Point } from "./geo.js";
import type { GeohashCell } from "@mark1russell7/geo";

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


// =============================================================================
// geo.osmFeatures and geo.arcgisFeatures Types - the map data of a box
// =============================================================================

/** A box on the map, in degrees. When `west` is more than `east`, the box crosses the antimeridian. */
export interface GeoBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

const lon = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);
const box: z.ZodType<GeoBox> = z
  .object({ west: lon, south: lat, east: lon, north: lat })
  .refine((value) => value.south <= value.north, "The south of the box is north of its north")
  .describe("The box (degrees). When west is more than east, the box crosses the antimeridian");
const userAgent = z
  .string()
  .min(3)
  .max(300)
  .regex(/^[\x20-\x7e]+$/, "The User-Agent has a character that is not printable ASCII")
  .describe("The User-Agent that names your application and a contact. The policies of the public servers require it");
const noControl = /^[^\u0000-\u001f\u007f]+$/;

/** A feature in the output: GeoJSON (RFC 7946), in WGS84 longitude and latitude. */
export interface GeoFeatureOutput {
  type: "Feature";
  id?: string | number | undefined;
  geometry?: unknown;
  properties: Readonly<Record<string, unknown>> | null;
}

/** A collection of features in the output. */
export interface GeoFeatureCollectionOutput {
  type: "FeatureCollection";
  features: readonly GeoFeatureOutput[];
}

const featureCollection: z.ZodType<GeoFeatureCollectionOutput> = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        id: z.union([z.string(), z.number()]).optional(),
        geometry: z.unknown().describe("A GeoJSON geometry, or null"),
        properties: z.record(z.string(), z.unknown()).nullable(),
      })
    ),
  })
  .describe("The features as a GeoJSON feature collection (RFC 7946)");

/** The input of `geo.osmFeatures`: a box, the selectors of the elements, and the server. */
export interface GeoOsmFeaturesInput {
  bbox: GeoBox;
  selectors: { key: string; values?: string[] | undefined; kinds?: ("node" | "way" | "relation")[] | undefined }[];
  userAgent: string;
  baseUrl?: string | undefined;
  timeoutSeconds?: number | undefined;
}

export const GeoOsmFeaturesInputSchema: z.ZodType<GeoOsmFeaturesInput> = z.object({
  bbox: box,
  selectors: z
    .array(
      z.object({
        key: z.string().min(1).max(100).regex(noControl).describe("A tag key, for example amenity"),
        values: z.array(z.string().min(1).max(255).regex(noControl)).min(1).max(50).optional().describe("The values of the key (default: each value)"),
        kinds: z.array(z.enum(["node", "way", "relation"])).min(1).optional().describe("The kinds of elements (default: each kind)"),
      })
    )
    .min(1)
    .max(20)
    .describe("The selectors. An element that one selector selects is in the output"),
  userAgent,
  baseUrl: z.url().optional().describe("Another Overpass server (default: the main public server)"),
  timeoutSeconds: z.number().int().min(1).max(180).optional().describe("The time limit of the query on the server, in seconds (default: 60)"),
});

/** The output of `geo.osmFeatures`: the features, the elements with no feature, and the facts of the data. */
export interface GeoOsmFeaturesOutput {
  collection: GeoFeatureCollectionOutput;
  skipped: readonly { id: string; reason: string }[];
  dataAt?: string | undefined;
  attribution: string;
}

export const GeoOsmFeaturesOutputSchema: z.ZodType<GeoOsmFeaturesOutput> = z.object({
  collection: featureCollection,
  skipped: z.array(z.object({ id: z.string(), reason: z.string() })).describe("The elements with no feature or with an incomplete feature, and the reason"),
  dataAt: z.string().optional().describe("The time of the OpenStreetMap data of the server"),
  attribution: z.string().describe("The copyright text of the data. A map of the data shows it"),
});

/** The input of `geo.arcgisFeatures`: a layer, a box, a condition, the fields and the limits. */
export interface GeoArcgisFeaturesInput {
  layerUrl: string;
  bbox: GeoBox;
  where?: string | undefined;
  outFields?: string[] | undefined;
  returnGeometry?: boolean | undefined;
  maxAllowableOffset?: number | undefined;
  userAgent: string;
  pageSize?: number | undefined;
  maxFeatures?: number | undefined;
  timeoutMs?: number | undefined;
}

export const GeoArcgisFeaturesInputSchema: z.ZodType<GeoArcgisFeaturesInput> = z.object({
  layerUrl: z.url().describe("The URL of the layer, for example https://host/arcgis/rest/services/Name/FeatureServer/0"),
  bbox: box,
  where: z.string().min(1).max(2000).regex(noControl).optional().describe("The SQL condition of the query (default: 1=1, each feature)"),
  outFields: z.array(z.string().min(1).max(100).regex(/^[A-Za-z0-9_.]+$/)).max(100).optional().describe("The fields of each feature (default: each field)"),
  returnGeometry: z.boolean().optional().describe("False for features with no geometry, a smaller answer (default: true)"),
  maxAllowableOffset: z.number().positive().max(1).optional().describe("The largest distance in degrees between a geometry and its simplified form (default: no simplification)"),
  userAgent,
  pageSize: z.number().int().min(1).max(2000).optional().describe("The largest number of features of one request (default: 1000)"),
  maxFeatures: z.number().int().min(1).max(100_000).optional().describe("The largest number of features of the output (default: 10000)"),
  timeoutMs: z.number().int().positive().max(120_000).optional().describe("The time limit of one request, in milliseconds (default: 30000)"),
});

/** The output of `geo.arcgisFeatures`: the features, the number of requests, and if the limit stopped the pages. */
export interface GeoArcgisFeaturesOutput {
  collection: GeoFeatureCollectionOutput;
  requests: number;
  truncated: boolean;
}

export const GeoArcgisFeaturesOutputSchema: z.ZodType<GeoArcgisFeaturesOutput> = z.object({
  collection: featureCollection,
  requests: z.number().int().describe("The number of requests to the layer"),
  truncated: z.boolean().describe("True when the layer has more features than maxFeatures, or when it stopped the pages"),
});

/** The input of `geo.soilAtPoint`: a point, and the User-Agent of the request. */
export interface GeoSoilAtPointInput {
  lat: number;
  lon: number;
  userAgent: string;
  timeoutMs?: number | undefined;
}

export const GeoSoilAtPointInputSchema: z.ZodType<GeoSoilAtPointInput> = z.object({
  lat: z.number().min(-90).max(90).describe("The latitude of the point, in degrees (WGS84)"),
  lon: z.number().min(-180).max(180).describe("The longitude of the point, in degrees (WGS84)"),
  userAgent,
  timeoutMs: z.number().int().positive().max(120_000).optional().describe("The time limit of the request, in milliseconds (default: 30000)"),
});

/** The output of `geo.soilAtPoint`: the major components of the map unit at the point, and the citation of the data. */
export interface GeoSoilAtPointOutput {
  components: SoilComponent[];
  attribution: string;
}

const nullableNumber = z.number().nullable();

export const GeoSoilAtPointOutputSchema: z.ZodType<GeoSoilAtPointOutput> = z.object({
  components: z
    .array(
      z.object({
        mukey: z.string().describe("The key of the map unit"),
        mapUnit: z.string().describe("The name of the map unit"),
        component: z.string().describe("The name of the component"),
        percent: nullableNumber.describe("The percent of the map unit that the component covers"),
        septic: z.enum(["Not limited", "Somewhat limited", "Very limited"]).nullable().describe("The rating class for septic tank absorption fields"),
        septicValue: nullableNumber.describe("The septic rating from 0 (no limit) to 1 (the most limit)"),
        slope: z.object({ low: nullableNumber, representative: nullableNumber, high: nullableNumber }).describe("The slope of the component, in percent"),
        drainage: z.string().nullable().describe("The drainage class, for example Somewhat poorly drained"),
        hydric: z.string().nullable().describe("The hydric rating: Yes, No or Unranked"),
      })
    )
    .describe("The major components of the map unit at the point, the largest first. An empty list: the survey has no map unit at the point"),
  attribution: z.string().describe("The citation of the soil data (SSURGO, public domain)"),
});
