/**
 * The procedure of `@procedures/weather`: `weather.forecast`.
 *
 * The request goes through the host policy of `@procedures/http` (audit pass 2, O55). The policy
 * refuses a `baseUrl` on a loopback, private or link-local address, unless the host allows it.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { createHostFetch, isHostNotAllowed } from "@procedures/http";
import { z } from "zod";
import { forecastUrl, readForecast, type Forecast } from "./weather.js";

/**
 * The part of `fetch` that `weather.forecast` uses. The default is `createHostFetch()` of
 * `@procedures/http`: each public host, and no other host.
 */
export type FetchForecast = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** The settings of the host for the procedures of this package. The procedure input cannot change them. */
export interface WeatherProceduresOptions {
  /**
   * The function that sends the request. The default is `createHostFetch()`. A host with its own
   * Open-Meteo server on a private address gives `createHostFetch({ allow: ["10.0.0.5:8080"] })`.
   */
  readonly fetch?: FetchForecast | undefined;
}

const ForecastInputSchema = z.object({
  lat: z.number().min(-90).max(90).describe("The latitude of the point, in degrees"),
  lon: z.number().min(-180).max(180).describe("The longitude of the point, in degrees"),
  days: z.number().int().min(1).max(16).default(7).describe("The number of days (default: 7, at most 16)"),
  units: z.enum(["metric", "imperial"]).default("metric").describe("metric (°C, km/h) or imperial (°F, mph); default: metric"),
  hourly: z.boolean().default(false).describe("Also give each hour (default: false)"),
  baseUrl: z
    .url()
    .optional()
    .describe("Another Open-Meteo server (default: the public server). The host policy refuses a loopback, private or link-local address."),
  timeoutMs: z.number().int().positive().max(120_000).default(20_000).describe("The time limit, in milliseconds (default: 20000)"),
});
type ForecastInput = z.infer<typeof ForecastInputSchema>;

const nullableNumber = z.number().nullable();
const ForecastOutputSchema = z.object({
  timezone: z.string(),
  units: z.object({ temperature: z.string(), windSpeed: z.string() }),
  daily: z.array(
    z.object({
      date: z.string(),
      temperatureMax: nullableNumber,
      temperatureMin: nullableNumber,
      precipitationProbability: nullableNumber,
      windSpeedMax: nullableNumber,
      weatherCode: nullableNumber,
    })
  ),
  hourly: z
    .array(z.object({ time: z.string(), temperature: nullableNumber, precipitationProbability: nullableNumber, weatherCode: nullableNumber }))
    .optional(),
});

/**
 * This function gives the procedures of this package with the settings of the host. Without
 * options, the requests go through the default host policy of `@procedures/http`.
 */
export function createWeatherProcedures(options: WeatherProceduresOptions = {}): AnyProcedure[] {
  const fetchForecast: FetchForecast = options.fetch ?? createHostFetch();
  const forecast = createProcedure()
    .path(["weather", "forecast"])
    .input(zodAdapter<ForecastInput>(ForecastInputSchema))
    .output(zodAdapter<Forecast>(ForecastOutputSchema))
    .meta({
      description: "Give the weather forecast of a point for each day, and optionally each hour (Open-Meteo)",
      output: "json",
      effects: { reads: ["network"], writes: [] },
    })
    .handler(async (input: ForecastInput, ctx?: ProcedureContext): Promise<Forecast> => {
      const signals = [AbortSignal.timeout(input.timeoutMs), ...(ctx?.signal ? [ctx.signal] : [])];
      let response: Awaited<ReturnType<FetchForecast>>;
      try {
        response = await fetchForecast(forecastUrl(input), { signal: AbortSignal.any(signals), headers: { accept: "application/json" } });
      } catch (error) {
        // A refusal of the host policy keeps its code and its reason
        if (isHostNotAllowed(error)) throw error;
        const reason = (error as { name?: string }).name === "TimeoutError" ? `no answer in ${input.timeoutMs} ms` : "the request failed";
        throw new Error(`Open-Meteo did not answer: ${reason}`);
      }
      if (!response.ok) throw new Error(`Open-Meteo gave HTTP ${response.status}`);
      return readForecast(await response.json(), input.hourly);
    })
    .build() as AnyProcedure;
  return [forecast];
}

export const weatherProcedures: AnyProcedure[] = createWeatherProcedures();

export const weatherForecastProcedure: AnyProcedure = weatherProcedures[0]!;
