# @procedures/geo

[![npm](https://img.shields.io/npm/v/@procedures/geo?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/geo)

Map procedures: the coordinates of an address (OpenStreetMap Nominatim) and the time and the distance of a drive (OSRM).

## Install

```bash
pnpm add @procedures/geo @procedures/client
```

A host registers the procedures with `createRegistry(geoModule)`, or with `import "@procedures/geo/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `geo.geocode` | reads `network` | Finds the coordinates of an address or a place name. |
| `geo.route` | reads `network` | Gives the kilometres and the minutes of a drive between two points. |

## Example

```ts
const { found, result } = await client.exec(["geo", "geocode"], {
  query: "Brandenburger Tor, Berlin",
  userAgent: "my-app/1.0 (me@example.org)",
});
```

## The policy of the public servers

The Nominatim policy permits at most one request each second, and it requires a `User-Agent` that names your application. `geo.geocode` requires `userAgent` for this reason. The OSRM demonstration server has a fair-use limit. Give `baseUrl` to use your own server of either kind.
