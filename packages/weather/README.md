# @procedures/weather

[![npm](https://img.shields.io/npm/v/@procedures/weather?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/weather)

A weather forecast for a point from Open-Meteo, without a key. The days and the hours are local to the point.

## Install

```bash
pnpm add @procedures/weather @procedures/client
```

A host registers the procedures with `createRegistry(weatherModule)`, or with `import "@procedures/weather/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `weather.forecast` | reads `network` | Gives the forecast of each day, and optionally of each hour: temperatures, precipitation probability, wind and the WMO weather code. |

## Example

```ts
const forecast = await client.exec(["weather", "forecast"], { lat: 52.52, lon: 13.4, days: 3, units: "metric" });
```

## Units

`units: "metric"` (the default) gives °C and km/h. `units: "imperial"` gives °F and mph. The `units` field of the result names them.
