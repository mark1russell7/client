/**
 * The procedures of `@procedures/geo`: `geo.geocode` and `geo.route`.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { z } from "zod";
import { drivingRoute, geocode, type GeocodeResult, type RouteResult } from "./geo.js";

const NETWORK_READ = { reads: ["network"], writes: [] };
const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const timeoutMs = z.number().int().positive().max(120_000).default(20_000).describe("The time limit, in milliseconds (default: 20000)");

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

export const geoGeocodeProcedure: AnyProcedure = createProcedure()
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
    const result = await geocode(input.query, { ...input, signal: ctx?.signal });
    return result === undefined ? { found: false } : { found: true, result };
  })
  .build() as AnyProcedure;

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

export const geoRouteProcedure: AnyProcedure = createProcedure()
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
      drivingRoute(input.from, input.to, { baseUrl: input.baseUrl, timeoutMs: input.timeoutMs, signal: ctx?.signal })
  )
  .build() as AnyProcedure;

export const geoProcedures: AnyProcedure[] = [geoGeocodeProcedure, geoRouteProcedure];
