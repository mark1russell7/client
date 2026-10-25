/**
 * The procedures of `@procedures/geo`: `geo.geocode`, `geo.route`, `geo.distance` and `geo.geohash`.
 *
 * `geo.geocode` and `geo.route` send their requests with the `fetch` of the module. The default is
 * the global `fetch`, so the root stays safe for a browser. A Node host that takes calls from
 * others gives `createHostFetch()` of `@procedures/http` to `createGeoModule()`. Then the host
 * policy refuses a `baseUrl` on a loopback, private or link-local address (audit pass 2, O55).
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client/browser";
import { z } from "zod";
import { drivingRoute, geocode, type FetchJson, type GeocodeResult, type RouteResult } from "./geo.js";
import { geoDistance } from "./procedures/geo/distance.js";
import { geoGeohash } from "./procedures/geo/geohash.js";
import {
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
   * The function that sends the requests of `geo.geocode` and `geo.route`. The default is the
   * global `fetch`. A Node host gives `createHostFetch()` of `@procedures/http`.
   */
  readonly fetch?: FetchJson | undefined;
}

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

function geocodeProcedure(fetch: FetchJson | undefined): AnyProcedure {
  return createProcedure()
    .path(["geo", "geocode"])
    .input(zodAdapter<GeocodeInput>(GeocodeInputSchema))
    .output(zodAdapter<GeocodeOutput>(GeocodeOutputSchema))
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
    .build() as AnyProcedure;
}

// =============================================================================
// geo.route
// =============================================================================

const RouteInputSchema = z.object({
  from: point.describe("The start"),
  to: point.describe("The destination"),
  baseUrl: z.url().optional().describe("Another OSRM server (default: the public demonstration server)"),
  timeoutMs,
});
type RouteInput = z.infer<typeof RouteInputSchema>;
const RouteOutputSchema = z.object({ km: z.number(), minutes: z.number() });

function routeProcedure(fetch: FetchJson | undefined): AnyProcedure {
  return createProcedure()
    .path(["geo", "route"])
    .input(zodAdapter<RouteInput>(RouteInputSchema))
    .output(zodAdapter<RouteResult>(RouteOutputSchema))
    .meta({
      description: "Give the time and the distance of a drive between two points (OSRM)",
      output: "json",
      effects: NETWORK_READ,
    })
    .handler(
      async (input: RouteInput, ctx?: ProcedureContext): Promise<RouteResult> =>
        drivingRoute(input.from, input.to, { baseUrl: input.baseUrl, timeoutMs: input.timeoutMs, signal: ctx?.signal, fetch })
    )
    .build() as AnyProcedure;
}

export const geoGeocodeProcedure: AnyProcedure = geocodeProcedure(undefined);

export const geoRouteProcedure: AnyProcedure = routeProcedure(undefined);

// =============================================================================
// geo.distance
// =============================================================================

export const geoDistanceProcedure: AnyProcedure = createProcedure()
  .path(["geo", "distance"])
  .input(zodAdapter<GeoDistanceInput>(GeoDistanceInputSchema))
  .output(zodAdapter<GeoDistanceOutput>(GeoDistanceOutputSchema))
  .meta({
    description: "Give the great-circle distance between two points in kilometres (haversine), without the network",
    output: "json",
    effects: PURE,
  })
  .handler(async (input: GeoDistanceInput): Promise<GeoDistanceOutput> => geoDistance(input))
  .build() as AnyProcedure;

// =============================================================================
// geo.geohash
// =============================================================================

export const geoGeohashProcedure: AnyProcedure = createProcedure()
  .path(["geo", "geohash"])
  .input(zodAdapter<GeoGeohashInput>(GeoGeohashInputSchema))
  .output(zodAdapter<GeoGeohashOutput>(GeoGeohashOutputSchema))
  .meta({
    description: "Give the geohash of a point and the cell of that geohash, without the network",
    output: "json",
    effects: PURE,
  })
  .handler(async (input: GeoGeohashInput): Promise<GeoGeohashOutput> => geoGeohash(input))
  .build() as AnyProcedure;

export const geoProcedures: AnyProcedure[] = [geoGeocodeProcedure, geoRouteProcedure, geoDistanceProcedure, geoGeohashProcedure];

/**
 * This function gives the procedures of this package with the settings of the host. Without a
 * `fetch`, it gives `geoProcedures`.
 */
export function createGeoProcedures(options: GeoProceduresOptions = {}): AnyProcedure[] {
  if (options.fetch === undefined) return geoProcedures;
  return [geocodeProcedure(options.fetch), routeProcedure(options.fetch), geoDistanceProcedure, geoGeohashProcedure];
}
