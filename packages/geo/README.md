# @procedures/geo

[![npm](https://img.shields.io/npm/v/@procedures/geo?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/geo)

Map procedures. They give the coordinates of an address (OpenStreetMap Nominatim) and the time and the distance of a drive (OSRM). The package also has a procedure for each function of [`@mark1russell7/geo`](https://github.com/mark1russell7/geo): distances, bearings, boxes, polygons, buffers and geohashes.

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
| `geo.distance` | none | Gives the great-circle distance between two points, in kilometres. It is deprecated: use `geo.distanceKm`. |
| `geo.geohash` | none | Gives the geohash of a point and the cell of that geohash. |
| 42 generated procedures | none | Each one calls one function of `@mark1russell7/geo`, for example `geo.distanceKm`, `geo.destinationKm` and `geo.bboxOfPoints`. |

## Example

```ts
const { found, result } = await client.exec(["geo", "geocode"], {
  query: "Brandenburger Tor, Berlin",
  userAgent: "my-app/1.0 (me@example.org)",
});
```

## The generated procedures

The package has 42 procedures in the namespace `geo` that come from the types of `@mark1russell7/geo`. Each one calls one function of the library with JSON inputs and a JSON output. Each one has no effects: it reads nothing and writes nothing.

- The input is an object with one property for each parameter of the function, by its name.
- The JSON Schemas of the input and the output come from the types. A named type has one definition in `$defs`.
- A point is `{ lat, lon }` in degrees, for example `{ "lat": 42.3601, "lon": -71.0589 }`.

`geoManifest` gives the names, the schemas and the effects of each generated procedure. `geoHomeProcedures` gives the procedures. `geoModule` and `createGeoModule()` have them.

```ts
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { geoModule } from "@procedures/geo";

const registry = createRegistry(geoModule);
const output = await invokePath(["geo", "destinationKm"], { from: { lat: 42.3601, lon: -71.0589 }, bearingDegrees: 225, distance: 300 }, { registry });
const point = await outputValue(output);
```

## The functions with no procedure

6 functions of the library have no procedure. The manifest gives each with its reason:

| Functions | Reason | The cause |
| --- | --- | --- |
| `geohash` | `overlay` | The hand-written procedure `geo.geohash` has this name. It also gives the cell of the hash. |
| `parseGeoJson`, `parseGeometry`, `parseLatLon` | `output-not-json` | The result can hold an instance of the class `GeoError`. |
| `pointLocator`, `regionSimplifier` | `output-not-json` | The result is a function. |

## Update the manifest

After an update of `@mark1russell7/geo`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package geo
```

The command writes `src/manifest.ts`. It also raises the ratchet of the library in `wraps.coverage.json`. CI starts `node scripts/wraps.ts check`. The check fails when the manifest is not current, or when the share of the functions with a procedure falls.

The wrap is pure: its `wrap.json` has `"pure": true`. So the check also examines the effects of the generated procedures, the browser entries and the program `point-at-the-median-distance` of `wraps.programs.json`. The hand-written procedures `geo.geocode` and `geo.route` read the network. They are not in the manifest, so the gate does not examine them.

## Distance and geohash

The procedures `geo.distance` and `geo.geohash` use [`@mark1russell7/geo`](https://github.com/mark1russell7/geo). They use no network. For the plain functions, import that package:

```ts
import { decodeGeohash, distanceKm, geohash } from "@mark1russell7/geo";
import { EARTH_RADIUS_KM } from "@procedures/geo";

distanceKm({ lat: 48.8584, lon: 2.2945 }, { lat: 52.5163, lon: 13.3777 }, EARTH_RADIUS_KM); // 879.0864603595937
geohash({ lat: 48.8584, lon: 2.2945 }); // "u09tunq"
decodeGeohash("u09tunq"); // { south, west, north, east, center }
```

- `geo.distance` uses the haversine formula on a sphere with the mean radius of the Earth (`EARTH_RADIUS_KM`, 6371 km). It does not round the result. A road is longer than this distance.
- `geo.distance` is deprecated, and it goes at a later MINOR of the client group. `geo.distanceKm` with `radiusKm: 6371` gives the same value. Its default radius is 6371.0088 km.
- `geo.geohash` gives `precision` characters (1 to 12, default 7) and the cell of the geohash. The first bit is the longitude. A coordinate on the middle of a range goes to the upper half.
- The procedures refuse a point off the map and a precision out of range.
- This package also has `greatCircleKm`, `geohash`, `decodeGeohash`, `GeohashCell` and the geohash constants. They are deprecated, and they go at the next MINOR of the client group. Until then, they keep their old checks.

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

`mcpHostModules` of `@procedures/bundle-assistant` has a module of `geo` with this `fetch`. The dev-tools server uses it. A refusal is `FORBIDDEN` with the reason `host-not-allowed`.

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
