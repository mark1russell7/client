import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { forecastUrl, readForecast, weatherCodeGroup } from "./weather.js";
import { weatherProcedures } from "./procedures.js";

/** A made-up Open-Meteo answer for two days and two hours. */
const answer = {
  timezone: "Europe/Berlin",
  daily_units: { temperature_2m_max: "°C", wind_speed_10m_max: "km/h" },
  daily: {
    time: ["2026-10-16", "2026-10-17"],
    temperature_2m_max: [14.2, 12],
    temperature_2m_min: [6.1, 5],
    precipitation_probability_max: [20, null],
    wind_speed_10m_max: [11.5, 9],
    weather_code: [3, 61],
  },
  hourly: { time: ["2026-10-16T00:00", "2026-10-16T01:00"], temperature_2m: [7, 6.5], precipitation_probability: [0, 5], weather_code: [1, 2] },
};

describe("weather", () => {
  it("asks for the metric units by default and the imperial units on request", () => {
    const metric = forecastUrl({ lat: 1.5, lon: -2.5, days: 3, units: "metric", hourly: false });
    expect(metric).toContain("latitude=1.5");
    expect(metric).toContain("forecast_days=3");
    expect(metric).not.toContain("fahrenheit");
    expect(metric).not.toContain("hourly=");
    const imperial = forecastUrl({ lat: 0, lon: 0, days: 1, units: "imperial", hourly: true });
    expect(imperial).toContain("temperature_unit=fahrenheit");
    expect(imperial).toContain("wind_speed_unit=mph");
    expect(imperial).toContain("hourly=");
  });

  it("makes one record for each day and hour, with null for a missing value", () => {
    const forecast = readForecast(answer, true);
    expect(forecast.timezone).toBe("Europe/Berlin");
    expect(forecast.units).toEqual({ temperature: "°C", windSpeed: "km/h" });
    expect(forecast.daily[1]).toEqual({
      date: "2026-10-17",
      temperatureMax: 12,
      temperatureMin: 5,
      precipitationProbability: null,
      windSpeedMax: 9,
      weatherCode: 61,
    });
    expect(forecast.hourly).toHaveLength(2);
    expect(readForecast(answer, false).hourly).toBeUndefined();
  });

  it("refuses an answer without a daily forecast", () => {
    expect(() => readForecast({ error: true }, false)).toThrow(/no daily forecast/);
  });
});

describe("weatherCodeGroup", () => {
  it("gives the group of each code that Open-Meteo uses", () => {
    expect(weatherCodeGroup(0)).toBe("clear");
    expect(weatherCodeGroup(1)).toBe("mainly-clear");
    expect(weatherCodeGroup(2)).toBe("partly-cloudy");
    expect(weatherCodeGroup(3)).toBe("overcast");
    expect([45, 48].map(weatherCodeGroup)).toEqual(["fog", "fog"]);
    expect([51, 53, 55, 56, 57].map(weatherCodeGroup)).toEqual(["drizzle", "drizzle", "drizzle", "freezing-drizzle", "freezing-drizzle"]);
    expect([61, 63, 65, 66, 67].map(weatherCodeGroup)).toEqual(["rain", "rain", "rain", "freezing-rain", "freezing-rain"]);
    expect([71, 73, 75, 77].map(weatherCodeGroup)).toEqual(["snow", "snow", "snow", "snow-grains"]);
    expect([80, 81, 82, 85, 86].map(weatherCodeGroup)).toEqual(["rain-showers", "rain-showers", "rain-showers", "snow-showers", "snow-showers"]);
    expect([95, 96, 99].map(weatherCodeGroup)).toEqual(["thunderstorm", "thunderstorm-hail", "thunderstorm-hail"]);
  });

  it("gives undefined for a code that Open-Meteo does not use, and for null", () => {
    expect([4, 44, 50, 100, -1, 2.5].map(weatherCodeGroup)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(weatherCodeGroup(null)).toBeUndefined();
    expect(weatherCodeGroup(undefined)).toBeUndefined();
  });
});

describe("weather.forecast", () => {
  const registry = new ProcedureRegistry();
  for (const procedure of weatherProcedures) registry.register(procedure);
  const call = async <T>(input: unknown): Promise<T> =>
    (await outputValue(await invokePath(["weather", "forecast"], input, { registry }), ["weather", "forecast"])) as T;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives the forecast of a point, and needs the point", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(answer)));
    const forecast = await call<{ daily: unknown[] }>({ lat: 52.5, lon: 13.4, days: 2 });
    expect(forecast.daily).toHaveLength(2);
    await expect(call({ days: 2 })).rejects.toThrow(/lat/);
  });

  it("reports an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await expect(call({ lat: 0, lon: 0 })).rejects.toThrow(/HTTP 503/);
  });
});
