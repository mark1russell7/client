/**
 * A weather forecast for a point from Open-Meteo (no key). The days and the hours are local to the
 * point (`timezone=auto`).
 */

export const OPEN_METEO_URL = "https://api.open-meteo.com";

export type Units = "metric" | "imperial";

export interface ForecastDay {
  /** The local date (`YYYY-MM-DD`) */
  readonly date: string;
  readonly temperatureMax: number | null;
  readonly temperatureMin: number | null;
  /** The highest probability of precipitation of the day, in percent */
  readonly precipitationProbability: number | null;
  readonly windSpeedMax: number | null;
  /** The WMO weather code */
  readonly weatherCode: number | null;
}

export interface ForecastHour {
  /** The local time (`YYYY-MM-DDTHH:MM`) */
  readonly time: string;
  readonly temperature: number | null;
  readonly precipitationProbability: number | null;
  readonly weatherCode: number | null;
}

export interface Forecast {
  /** The IANA time zone of the point */
  readonly timezone: string;
  readonly units: { readonly temperature: string; readonly windSpeed: string };
  readonly daily: ForecastDay[];
  readonly hourly?: ForecastHour[] | undefined;
}

const DAILY = ["temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "wind_speed_10m_max", "weather_code"];
const HOURLY = ["temperature_2m", "precipitation_probability", "weather_code"];

/** This function gives the Open-Meteo address of a forecast. */
export function forecastUrl(options: { lat: number; lon: number; days: number; units: Units; hourly: boolean; baseUrl?: string | undefined }): string {
  const params = new URLSearchParams({
    latitude: String(options.lat),
    longitude: String(options.lon),
    daily: DAILY.join(","),
    timezone: "auto",
    forecast_days: String(options.days),
  });
  if (options.hourly) params.set("hourly", HOURLY.join(","));
  if (options.units === "imperial") {
    params.set("temperature_unit", "fahrenheit");
    params.set("wind_speed_unit", "mph");
  }
  return `${options.baseUrl ?? OPEN_METEO_URL}/v1/forecast?${params.toString()}`;
}

type Columns = Record<string, Array<number | string | null> | undefined>;

const column = (block: Columns, name: string, index: number): number | null => {
  const value = block[name]?.[index];
  return typeof value === "number" ? value : null;
};

/** This function changes the columns of an Open-Meteo answer to one record for each day and hour. */
export function readForecast(body: unknown, hourly: boolean): Forecast {
  const answer = body as { timezone?: string; daily?: Columns; daily_units?: Record<string, string>; hourly?: Columns };
  if (answer.daily === undefined || !Array.isArray(answer.daily["time"])) throw new Error("Open-Meteo gave no daily forecast");
  const daily = answer.daily;
  const days = (daily["time"] ?? []).map((date, index) => ({
    date: String(date),
    temperatureMax: column(daily, "temperature_2m_max", index),
    temperatureMin: column(daily, "temperature_2m_min", index),
    precipitationProbability: column(daily, "precipitation_probability_max", index),
    windSpeedMax: column(daily, "wind_speed_10m_max", index),
    weatherCode: column(daily, "weather_code", index),
  }));
  const hours =
    hourly && answer.hourly !== undefined
      ? (answer.hourly["time"] ?? []).map((time, index) => ({
          time: String(time),
          temperature: column(answer.hourly as Columns, "temperature_2m", index),
          precipitationProbability: column(answer.hourly as Columns, "precipitation_probability", index),
          weatherCode: column(answer.hourly as Columns, "weather_code", index),
        }))
      : undefined;
  return {
    timezone: answer.timezone ?? "UTC",
    units: {
      temperature: answer.daily_units?.["temperature_2m_max"] ?? "",
      windSpeed: answer.daily_units?.["wind_speed_10m_max"] ?? "",
    },
    daily: days,
    ...(hours !== undefined ? { hourly: hours } : {}),
  };
}

/**
 * The groups of the WMO weather codes that Open-Meteo gives (WMO 4677, the codes of its
 * documentation). A code outside them has no group.
 */
export type WeatherCodeGroup =
  | "clear"
  | "mainly-clear"
  | "partly-cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "freezing-drizzle"
  | "rain"
  | "freezing-rain"
  | "snow"
  | "snow-grains"
  | "rain-showers"
  | "snow-showers"
  | "thunderstorm"
  | "thunderstorm-hail";

const CODE_GROUPS: ReadonlyMap<number, WeatherCodeGroup> = new Map<number, WeatherCodeGroup>([
  [0, "clear"],
  [1, "mainly-clear"],
  [2, "partly-cloudy"],
  [3, "overcast"],
  [45, "fog"],
  [48, "fog"],
  [51, "drizzle"],
  [53, "drizzle"],
  [55, "drizzle"],
  [56, "freezing-drizzle"],
  [57, "freezing-drizzle"],
  [61, "rain"],
  [63, "rain"],
  [65, "rain"],
  [66, "freezing-rain"],
  [67, "freezing-rain"],
  [71, "snow"],
  [73, "snow"],
  [75, "snow"],
  [77, "snow-grains"],
  [80, "rain-showers"],
  [81, "rain-showers"],
  [82, "rain-showers"],
  [85, "snow-showers"],
  [86, "snow-showers"],
  [95, "thunderstorm"],
  [96, "thunderstorm-hail"],
  [99, "thunderstorm-hail"],
]);

/**
 * This function gives the group of a WMO weather code, as the field `weatherCode` of a forecast
 * gives it. It gives `undefined` for a code that Open-Meteo does not use, and for `null`.
 */
export function weatherCodeGroup(code: number | null | undefined): WeatherCodeGroup | undefined {
  return code === null || code === undefined ? undefined : CODE_GROUPS.get(code);
}
