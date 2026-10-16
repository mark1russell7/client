/**
 * The procedure of `@procedures/weather`: `weather.forecast`.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { z } from "zod";
import { forecastUrl, readForecast, type Forecast } from "./weather.js";

const ForecastInput = z.object({
  lat: z.number().min(-90).max(90).describe("The latitude of the point, in degrees"),
  lon: z.number().min(-180).max(180).describe("The longitude of the point, in degrees"),
  days: z.number().int().min(1).max(16).default(7).describe("The number of days (default: 7, at most 16)"),
  units: z.enum(["metric", "imperial"]).default("metric").describe("metric (°C, km/h) or imperial (°F, mph); default: metric"),
  hourly: z.boolean().default(false).describe("Also give each hour (default: false)"),
  baseUrl: z.url().optional().describe("Another Open-Meteo server (default: the public server)"),
  timeoutMs: z.number().int().positive().max(120_000).default(20_000).describe("The time limit, in milliseconds (default: 20000)"),
});
type ForecastInput = z.infer<typeof ForecastInput>;

const nullableNumber = z.number().nullable();
const ForecastOutput = z.object({
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

export const weatherForecastProcedure: AnyProcedure = createProcedure()
  .path(["weather", "forecast"])
  .input(zodAdapter<ForecastInput>(ForecastInput))
  .output(zodAdapter<Forecast>(ForecastOutput))
  .meta({
    description: "Give the weather forecast of a point for each day, and optionally each hour (Open-Meteo)",
    output: "json",
    effects: { reads: ["network"], writes: [] },
  })
  .handler(async (input: ForecastInput, ctx?: ProcedureContext): Promise<Forecast> => {
    const signals = [AbortSignal.timeout(input.timeoutMs), ...(ctx?.signal ? [ctx.signal] : [])];
    let response: Response;
    try {
      response = await fetch(forecastUrl(input), { signal: AbortSignal.any(signals), headers: { accept: "application/json" } });
    } catch (error) {
      const reason = (error as { name?: string }).name === "TimeoutError" ? `no answer in ${input.timeoutMs} ms` : "the request failed";
      throw new Error(`Open-Meteo did not answer: ${reason}`);
    }
    if (!response.ok) throw new Error(`Open-Meteo gave HTTP ${response.status}`);
    return readForecast(await response.json(), input.hourly);
  })
  .build() as AnyProcedure;

export const weatherProcedures: AnyProcedure[] = [weatherForecastProcedure];
