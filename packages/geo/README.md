# @procedures/geo

[![npm](https://img.shields.io/npm/v/@procedures/geo?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/geo)

Map procedures. They give the coordinates of an address (OpenStreetMap Nominatim) and the time and the distance of a drive (OSRM). They also give the great-circle distance and the geohash.

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
| `geo.distance` | none | Gives the great-circle distance between two points, in kilometres. |
| `geo.geohash` | none | Gives the geohash of a point and the cell of that geohash. |

## Example

```ts
const { found, result } = await client.exec(["geo", "geocode"], {
  query: "Brandenburger Tor, Berlin",
  userAgent: "my-app/1.0 (me@example.org)",
});
```

## Distance and geohash

These functions use no network:

```ts
import { decodeGeohash, geohash, greatCircleKm } from "@procedures/geo";

greatCircleKm({ lat: 48.8584, lon: 2.2945 }, { lat: 52.5163, lon: 13.3777 }); // 879.0864603595937
geohash({ lat: 48.8584, lon: 2.2945 }); // "u09tunq"
decodeGeohash("u09tunq"); // { south, west, north, east, center }
```

- `greatCircleKm(a, b)` uses the haversine formula on a sphere with the mean radius of the Earth (`EARTH_RADIUS_KM`, 6371 km). It does not round the result. A road is longer than this distance.
- `geohash(point, precision)` gives `precision` characters (1 to 12, default 7). The first bit is the longitude. A coordinate on the middle of a range goes to the upper half.
- `decodeGeohash(hash)` gives the edges and the center of the cell of a geohash. It reads upper case letters.
- The functions throw a `RangeError` for a point off the map and for a precision out of range.

## The policy of the public servers

The Nominatim policy permits at most one request each second. A `User-Agent` that names your application is necessary, so `geo.geocode` has the field `userAgent`. The OSRM demonstration server has a fair-use limit. Give `baseUrl` to use your own server of either kind.

## The host policy

`geo.geocode` and `geo.route` send their requests with the `fetch` of the module. The default is the global `fetch`, so the root stays safe for a browser.

A Node host that serves other callers gives `createHostFetch()` of `@procedures/http` to `createGeoModule()`. Then the host policy examines each `baseUrl`. It refuses a loopback, private or link-local address, unless the `allow` list of the host has it:

```ts
import { createHostFetch } from "@procedures/http";
import { createGeoModule } from "@procedures/geo/module";

const registry = createRegistry(createGeoModule({ fetch: createHostFetch({ allow: ["osrm.lan:5000"] }) }));
```

A refusal is `FORBIDDEN` with the reason `host-not-allowed`. `mcpHostModules` of `@procedures/bundle-assistant` has a module of `geo` with this policy. The dev-tools server uses it. In 0.28, that module still sends a refused request, with a `DeprecationWarning`. Version 0.29.0 refuses it.

## Map tiles on disk

The entry `@procedures/geo/tiles` is for Node only. The root of the package stays safe for a browser.

```ts
import { cachedTile, isTile } from "@procedures/geo/tiles";

const tile = { z: 12, x: 1205, y: 1539 };
if (isTile(tile)) {
  const png = await cachedTile(tile, { dir: "var/tiles", userAgent: "my-app/1.0 (me@example.com)" });
}
```

- `cachedTile` gets a tile from the server one time and keeps it as `<dir>/<z>/<x>/<y>.png`. After that, it gives the kept file without a request.
- The default server is `OSM_TILES`, the standard tiles of OpenStreetMap. Their policy asks for a real `User-Agent` and for a cache, so `userAgent` is necessary.
- The options `source`, `extension`, `timeoutMs`, `maxBytes` and `fetch` change the server, the file extension, the time limit, the largest tile and the fetch function.
- An HTTP error, no answer, or a body larger than `maxBytes` throws an error, and nothing is kept. Each file is written to a temporary name and then renamed.
- `isTile(tile, maxZoom)` tells if a tile exists at its zoom level. `tileUrl(template, tile)` fills `{z}`, `{x}` and `{y}`.
