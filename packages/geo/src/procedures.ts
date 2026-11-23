/**
 * The procedures of `@procedures/geo`: `geo.geocode`, `geo.route`, `geo.osmFeatures`,
 * `geo.arcgisFeatures`, `geo.distance` and `geo.geohash`.
 *
 * The procedures that use the network send their requests with the `fetch` of the module. The default is
 * the global `fetch`, so the root stays safe for a browser. A Node host that takes calls from
 * others gives `createHostFetch()` of `@procedures/http` to `createGeoModule()`. Then the host
 * policy refuses a `baseUrl` on a loopback, private or link-local address (audit pass 2, O55).
 */

import { createProcedure, type AnyProcedure, type ProcedureContext } from "@procedures/client/browser";
import * as z from "zod";
import type { Pace } from "polite-crawler/api";
import { drivingRoute, geocode, type GeocodeResult } from "./geo.js";
import { geoPace, type GeoFetch } from "./polite.js";
import { geoArcgisFeatures } from "./procedures/geo/arcgisFeatures.js";
import { geoDistance } from "./procedures/geo/distance.js";
import { geoGeohash } from "./procedures/geo/geohash.js";
import { geoOsmFeatures } from "./procedures/geo/osmFeatures.js";
import {
  GeoArcgisFeaturesInputSchema,
  GeoArcgisFeaturesOutputSchema,
  GeoOsmFeaturesInputSchema,
  GeoOsmFeaturesOutputSchema,
  type GeoArcgisFeaturesInput,
  type GeoArcgisFeaturesOutput,
  type GeoOsmFeaturesInput,
  type GeoOsmFeaturesOutput,
  GeoDistanceInputSchema,
  GeoDistanceOutputSchema,
  GeoGeohashInputSchema,
  GeoGeohashOutputSchema,
  type GeoDistanceInput,
  type GeoDistanceOutput,
  type GeoGeohashInput,
  type GeoGeohashOutput,
} from "./types.js";

const NETWORK_READ = { reads: ["network"], writes: [] };
const PURE = { reads: [], writes: [] };
const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const timeoutMs = z.number().int().positive().max(120_000).default(20_000).describe("The time limit, in milliseconds (default: 20000)");

/** The settings of the host for the procedures of this package. The procedure input cannot change them. */
export interface GeoProceduresOptions {
  /**
   * The function that sends the requests of the procedures that use the network. The default is
   * the global `fetch`. A Node host gives `createHostFetch()` of `@procedures/http`. A
   * `FetchJson` is sufficient for `geo.geocode` and `geo.route`. The map data procedures also read
   * `text()` and the headers.
   */
  readonly fetch?: GeoFetch | undefined;
  /**
   * The pace of the map data procedures (`geo.osmFeatures`, `geo.arcgisFeatures`): one request in
   * progress for each host, and a rest between two requests. The default is the pace of the process
   * (`geoPace()`). Give the pace of your other API clients to share it.
   */
  readonly pace?: Pace | undefined;
}

/** This function sends a request with the global `fetch` of the time of the call. */
const globalFetch: GeoFetch = (url, init) => fetch(url, init);

// =============================================================================
// geo.geocode
// =============================================================================

const GeocodeInputSchema = z.object({
  query: z.string().min(1).describe("An address or a place name"),
  userAgent: z
    .string()
    .min(3)
    .describe("The User-Agent that names your application. The Nominatim policy requires it, and it limits each application by it."),
  countryCodes: z.string().regex(/^[a-z]{2}(,[a-z]{2})*$/).optional().describe("Find only in these countries (ISO 3166-1 codes, for example us,ca)"),
  baseUrl: z.url().optional().describe("Another Nominatim server (default: the public server)"),
  timeoutMs,
});
type GeocodeInput = z.infer<typeof GeocodeInputSchema>;

interface GeocodeOutput {
  found: boolean;
  result?: GeocodeResult | undefined;
}
const GeocodeOutputSchema = z.object({
  found: z.boolean(),
  result: z.object({ lat: z.number(), lon: z.number(), displayName: z.string() }).optional(),
});

function geocodeProcedure(fetch: GeoFetch | undefined): AnyProcedure {
  return createProcedure()
    .path(["geo", "geocode"])
    .input(GeocodeInputSchema)
    .output(GeocodeOutputSchema)
    .meta({
      description: "Find the coordinates of an address or a place name (OpenStreetMap Nominatim)",
      args: ["query"],
      output: "json",
      effects: NETWORK_READ,
    })
    .handler(async (input: GeocodeInput, ctx?: ProcedureContext): Promise<GeocodeOutput> => {
      const result = await geocode(input.query, { ...input, signal: ctx?.signal, fetch });
      return result === undefined ? { found: false } : { found: true, result };
    })
    .build();
}

// =============================================================================
// geo.route
// =============================================================================

const RouteInputSchema = z.object({
  from: point.describe("The start"),
  to: point.describe("The destination"),
  baseUrl: z.url().optional().describe("Another OSRM server (default: the public demonstration server)"),
  line: z.enum(["full", "simplified"]).optional().describe("Also give the points of the route: each point of the road (full) or fewer points (simplified)"),
  timeoutMs,
});
type RouteInput = z.infer<typeof RouteInputSchema>;
const RouteOutputSchema = z.object({
  km: z.number(),
  minutes: z.number(),
  line: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
});
type RouteOutput = z.infer<typeof RouteOutputSchema>;

function routeProcedure(fetch: GeoFetch | undefined): AnyProcedure {
  return createProcedure()
    .path(["geo", "route"])
    .input(RouteInputSchema)
    .output(RouteOutputSchema)
    .meta({
      description: "Give the time and the distance of a drive between two points (OSRM)",
      output: "json",
      effects: NETWORK_READ,
    })
    .handler(
      async (input: RouteInput, ctx?: ProcedureContext): Promise<RouteOutput> => {
        const route = await drivingRoute(input.from, input.to, { baseUrl: input.baseUrl, timeoutMs: input.timeoutMs, signal: ctx?.signal, fetch, line: input.line });
        // The output schema has a mutable array, so the line is a copy of the readonly line of the result.
        return route.line ? { km: route.km, minutes: route.minutes, line: [...route.line] } : { km: route.km, minutes: route.minutes };
      }
    )
    .build();
}

// =============================================================================
// geo.osmFeatures and geo.arcgisFeatures
// =============================================================================

function osmFeaturesProcedure(fetch: GeoFetch | undefined, pace: Pace | undefined): AnyProcedure {
  return createProcedure()
    .path(["geo", "osmFeatures"])
    .input(GeoOsmFeaturesInputSchema)
    .output(GeoOsmFeaturesOutputSchema)
    .meta({
      description: "Give the features of OpenStreetMap in a box as GeoJSON (the Overpass API), for example the shelters or the roads of a town",
      output: "json",
      effects: NETWORK_READ,
    })
    .handler(
      async (input: GeoOsmFeaturesInput, ctx?: ProcedureContext): Promise<GeoOsmFeaturesOutput> =>
        geoOsmFeatures(input, { fetch: fetch ?? globalFetch, pace: pace ?? geoPace(), signal: ctx?.signal })
    )
    .build();
}

function arcgisFeaturesProcedure(fetch: GeoFetch | undefined, pace: Pace | undefined): AnyProcedure {
  return createProcedure()
    .path(["geo", "arcgisFeatures"])
    .input(GeoArcgisFeaturesInputSchema)
    .output(GeoArcgisFeaturesOutputSchema)
    .meta({
      description: "Give the features of an ArcGIS layer in a box as GeoJSON, for example the evacuation zones of an official map service",
      output: "json",
      effects: NETWORK_READ,
    })
    .handler(
      async (input: GeoArcgisFeaturesInput, ctx?: ProcedureContext): Promise<GeoArcgisFeaturesOutput> =>
        geoArcgisFeatures(input, { fetch: fetch ?? globalFetch, pace: pace ?? geoPace(), signal: ctx?.signal })
    )
    .build();
}

export const geoGeocodeProcedure: AnyProcedure = geocodeProcedure(undefined);

export const geoRouteProcedure: AnyProcedure = routeProcedure(undefined);

export const geoOsmFeaturesProcedure: AnyProcedure = osmFeaturesProcedure(undefined, undefined);

export const geoArcgisFeaturesProcedure: AnyProcedure = arcgisFeaturesProcedure(undefined, undefined);

// =============================================================================
// geo.distance
// =============================================================================

/**
 * The procedure `geo.distance`.
 *
 * @deprecated Use the generated procedure `geo.distanceKm` with `{ a, b, radiusKm: 6371 }`. It gives the same value.
 * The default radius of `geo.distanceKm` is 6371.0088 km. This procedure goes at a later MINOR of the client group.
 */
export const geoDistanceProcedure: AnyProcedure = createProcedure()
  .path(["geo", "distance"])
  .input(GeoDistanceInputSchema)
  .output(GeoDistanceOutputSchema)
  .meta({
    description:
      "Give the great-circle distance between two points in kilometres (haversine), without the network. Deprecated: use geo.distanceKm with radiusKm 6371",
    output: "json",
    effects: PURE,
    deprecated: true,
  })
  .handler(async (input: GeoDistanceInput): Promise<GeoDistanceOutput> => geoDistance(input))
  .build();

// =============================================================================
// geo.geohash
// =============================================================================

export const geoGeohashProcedure: AnyProcedure = createProcedure()
  .path(["geo", "geohash"])
  .input(GeoGeohashInputSchema)
  .output(GeoGeohashOutputSchema)
  .meta({
    description: "Give the geohash of a point and the cell of that geohash, without the network",
    output: "json",
    effects: PURE,
  })
  .handler(async (input: GeoGeohashInput): Promise<GeoGeohashOutput> => geoGeohash(input))
  .build();

export const geoProcedures: AnyProcedure[] = [
  geoGeocodeProcedure,
  geoRouteProcedure,
  geoOsmFeaturesProcedure,
  geoArcgisFeaturesProcedure,
  geoDistanceProcedure,
  geoGeohashProcedure,
];

/**
 * This function gives the procedures of this package with the settings of the host. Without a
 * `fetch` and a `pace`, it gives `geoProcedures`.
 */
export function createGeoProcedures(options: GeoProceduresOptions = {}): AnyProcedure[] {
  if (options.fetch === undefined && options.pace === undefined) return geoProcedures;
  return [
    geocodeProcedure(options.fetch),
    routeProcedure(options.fetch),
    osmFeaturesProcedure(options.fetch, options.pace),
    arcgisFeaturesProcedure(options.fetch, options.pace),
    geoDistanceProcedure,
    geoGeohashProcedure,
  ];
}
