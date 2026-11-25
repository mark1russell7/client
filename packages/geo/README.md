# @procedures/geo

[![npm](https://img.shields.io/npm/v/@procedures/geo?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/geo)

Map procedures. They give the coordinates of an address (OpenStreetMap Nominatim) and the time and the distance of a drive (OSRM). They also give the map data of a box as GeoJSON (OpenStreetMap and ArcGIS layers). The package also has a procedure for each function of [`@mark1russell7/geo`](https://github.com/mark1russell7/geo): distances, bearings, boxes, polygons, buffers and geohashes.

## Install

```bash
pnpm add @procedures/geo @procedures/client
```

A host registers the procedures with `createRegistry(geoModule)`, or with `import "@procedures/geo/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `geo.geocode` | reads `network` | Finds the coordinates of an address or a place name. |
| `geo.route` | reads `network` | Gives the kilometres and the minutes of a drive between two points. With `line`, it also gives the points of the route. |
| `geo.osmFeatures` | reads `network` | Gives the features of OpenStreetMap in a box, as GeoJSON. |
| `geo.arcgisFeatures` | reads `network` | Gives the features of an ArcGIS layer in a box, as GeoJSON. |
| `geo.soilAtPoint` | reads `network` | Gives the soil at a point, from USDA Soil Data Access (SSURGO): the septic rating, the slope, the drainage and the hydric rating of each major component. |
| `geo.distance` | none | Gives the great-circle distance between two points, in kilometres. It is deprecated: use `geo.distanceKm`. |
| `geo.geohash` | none | Gives the geohash of a point and the cell of that geohash. |
| 45 generated procedures | none | Each one calls one function of `@mark1russell7/geo`, for example `geo.distanceKm`, `geo.destinationKm` and `geo.bboxOfPoints`. |

## Example

```ts
const { found, result } = await client.exec(["geo", "geocode"], {
  query: "Brandenburger Tor, Berlin",
  userAgent: "my-app/1.0 (me@example.org)",
});
```

## The generated procedures

The package has 45 procedures in the namespace `geo` that come from the types of `@mark1russell7/geo`. Each one calls one function of the library with JSON inputs and a JSON output. Each one has no effects: it reads nothing and writes nothing.

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

7 functions of the library have no procedure. The manifest gives each with its reason:

| Functions | Reason | The cause |
| --- | --- | --- |
| `geohash` | `overlay` | The hand-written procedure `geo.geohash` has this name. It also gives the cell of the hash. |
| `parseGeoJson`, `parseGeometry`, `parseLatLon` | `output-not-json` | The result can hold an instance of the class `GeoError`. |
| `pointLocator`, `regionSimplifier` | `output-not-json` | The result is a function. |
| `lineReference` | `output-not-json` | The result is an object with functions. |

## Update the manifest

After an update of `@mark1russell7/geo`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package geo
```

The command writes `src/manifest.ts`. It also raises the ratchet of the library in `wraps.coverage.json`. CI starts `node scripts/wraps.ts check`. The check fails when the manifest is not current, or when the share of the functions with a procedure falls.

The wrap is pure: its `wrap.json` has `"pure": true`. So the check also examines the effects of the generated procedures, the browser entries and the program `point-at-the-median-distance` of `wraps.programs.json`. The hand-written procedures `geo.geocode`, `geo.route`, `geo.osmFeatures`, `geo.arcgisFeatures` and `geo.soilAtPoint` read the network. They are not in the manifest, so the gate does not examine them.

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

## The map data of a box

Two procedures give the features of a box as a GeoJSON feature collection (RFC 7946), in WGS84 longitude and latitude. A printed map or a map on a screen draws them.

```ts
const shelters = await client.exec(["geo", "osmFeatures"], {
  bbox: { west: 10.0, south: 50.0, east: 10.05, north: 50.03 },
  selectors: [{ key: "amenity", values: ["shelter"] }, { key: "emergency", values: ["assembly_point"] }],
  userAgent: "my-app/1.0 (me@example.org)",
});

const zones = await client.exec(["geo", "arcgisFeatures"], {
  layerUrl: "https://gis.example.org/arcgis/rest/services/Zones/FeatureServer/0",
  bbox: { west: 10.0, south: 50.0, east: 10.05, north: 50.03 },
  userAgent: "my-app/1.0 (me@example.org)",
});
```

`geo.osmFeatures` sends one query to an Overpass server:

- Each selector has a tag key, its values (each value when absent) and the kinds of elements (each kind when absent).
- A node gives a point. A way gives a line, or a polygon when it is a closed area.
- `isOsmArea` decides if a closed way is an area. It uses `area=yes`, `area=no`, and the rules of the OpenStreetMap wiki in `OSM_AREA_RULES`.
- A multipolygon or a boundary relation gives a polygon or a multipolygon. Another relation gives the lines of its ways.
- Each element with no geometry goes to `skipped`, with its reason. An incomplete feature is also in `skipped`.
- The output has `attribution`, the copyright text of the data. A map of the data must show it. `dataAt` is the time of the data of the server.
- A runtime error of the server (for example a time-out) is an error, not a part of the data.

`geo.arcgisFeatures` asks a layer of an ArcGIS map service for the features that intersect the box:

- `where` and `outFields` select the features and their fields.
- The procedure asks for the pages in sequence, until the last page or `maxFeatures` (default 10000). `truncated` tells if the limit stopped the pages.
- An error of the layer, for example a bad condition or a token that it needs, is an error.

A box that crosses the antimeridian has its `west` more than its `east`. It gives two queries.

`geo.soilAtPoint` asks USDA Soil Data Access for the major components of the map unit at a point:

```ts
const soil = await client.exec(["geo", "soilAtPoint"], { lat: 44.9, lon: -69.2, userAgent: "my-app/1.0 (me@example.org)" });
// soil.components[0].septic: "Very limited", soil.attribution: the citation of SSURGO
```

- The service takes its SQL query only in the body of a POST. The query only reads, and the point goes into it only as two numbers.
- The request goes only to the endpoint of Soil Data Access (`SOIL_DATA_ACCESS_URL`). The input has no `baseUrl`.
- The transport of this package sends a POST only for a request that tells that it only reads. The other procedures send no POST.
- A `fetch` of `createHostFetch()` sends no POST by default. A host that gives `geo.soilAtPoint` names the host in the option `readOnlyPost`:

```ts
createGeoModule({ fetch: createHostFetch({ readOnlyPost: ["sdmdataaccess.sc.egov.usda.gov"] }) });
```

- An empty list of components tells that the survey has no map unit at the point.
- SSURGO is a work of the US government, in the public domain. The output has its citation in `attribution`.

## The point of an address, with no geocoder

`locateAddress` finds the point of a street address in the features of `geo.osmFeatures`. It is a pure function. The address does not go to a server, because the request asks only for the data of a box.

```ts
import { locateAddress, parseStreetAddress, townBox } from "@procedures/geo";

const box = townBox(boundaries.collection.features, { name: "Exampleton", postcode: "00001" });
// Then fetch the elements with the tag addr:housenumber and the ways with the tag highway in the box.
const address = parseStreetAddress("24 Elm Street");
const found = address && locateAddress({ address, addresses: numbers.collection.features, streets: roads.collection.features });
```

- `normalizeStreet` writes each street name in one form, so "St. Mark's Avenue" and "Saint Marks Ave" are equal. `STREET_WORDS` is the table of the street words of the United States. A caller gives a different table for a different country.
- `townBox` gives the box of the administrative boundaries with the name of a town, and the areas with its postal code.
- An element with the street and the number gives the point. The result has the kind `match`, the ids of the elements, and their spread in metres.
- Else the result has the kind `interpolation`. The function joins the ways of the street with `joinLines` of `@mark1russell7/geo`, and uses the line with the most known numbers.
- A lower and a higher number of the same parity give the distance along the line. Else a straight-line fit of the known numbers gives it, with `leastSquares` of `@mark1russell7/rigor-statistics`.
- The known numbers of the same parity give the side of the street and the distance from the line.
- `errorMeters` is the error of the method on the data. The function removes each known element in turn and finds its point from the other elements. The value has the median and the largest error.
- With no number, no street line or fewer than 2 known numbers, the result has the kind `none` and its reason.

### The pace of the requests

Both procedures send their requests through `polite-crawler/api`:

- The pace keeps one request in progress for each host, and a rest of at least one second between two requests.
- A 429, 502, 503 or 504 parks the host for its `Retry-After`, or for a backoff. A 401 or a 403 stops the host for one hour.
- After a 429, 502, 503 or 504, the procedure sends the request again when the park ends. It sends a request at most `DEFAULT_ATTEMPTS` (3) times.
- `geoPace()` gives the pace of the process. Give your own pace to `createGeoModule({ pace })` to share it with your other API clients.
- The pure parts have no network: `overpassQuery`, `overpassExchange`, `osmFeatures`, `arcgisExchange`, `arcgisPage` and `bboxParts`.

The public Overpass servers ask for moderate use and a `User-Agent` that names your application, so `userAgent` is necessary. Give `baseUrl` to use your own Overpass server.

## The point of a ZIP code, with no request that names it

`zipCenter` gives an approximate point for a US ZIP code. The point is the internal point of its ZIP Code Tabulation Area (ZCTA). The data comes from the national ZCTA file of the Census Gazetteer. The caller downloads the whole file one time, so no request names the ZIP code.

```ts
import { readZipEntries } from "@mark1russell7/files/archive";
import { parseZctaGazetteer, zctaGazetteerUrl, zctaIndex, zipCenter } from "@procedures/geo";

const bytes = new Uint8Array(await (await fetch(zctaGazetteerUrl(2024))).arrayBuffer());
const read = readZipEntries(bytes);
const entry = read.ok ? read.entries.find((file) => file.name.endsWith(".txt")) : undefined;
const index = zctaIndex(parseZctaGazetteer(new TextDecoder().decode(entry?.bytes)));
const point = zipCenter("00001-0002", index);
```

- `zctaGazetteerUrl` gives the URL of the file of a year, from 2012. The file is a ZIP archive of approximately 1 MB with one text file.
- This package does not unzip the file. The caller unzips it, for example with `readZipEntries` of `@mark1russell7/files/archive` on Node.
- `parseZctaGazetteer` reads the text. It finds the columns `GEOID`, `ALAND`, `INTPTLAT` and `INTPTLONG` by name, and ignores the spaces around each value.
- A text without these columns gives an error. A row with a bad value gives an error with its line number.
- Each record has the 5 digits of the ZCTA, its internal point, and its land area in square metres.
- `zip5` gives the 5 digits of `12345` and `12345-6789`. `zipCenter` accepts the two forms.
- A ZIP code with no ZCTA gives `undefined`. A ZIP code of post office boxes only often has no ZCTA.
- The internal point is in the area, but it is not the center of the population. Its error can be some kilometres in a large rural area.
- The files are public domain. `ZCTA_GAZETTEER_ATTRIBUTION` names the source.

## The policy of the public servers

The Nominatim policy permits at most one request each second. A `User-Agent` that names your application is necessary, so `geo.geocode` has the field `userAgent`. The OSRM demonstration server has a fair-use limit. Give `baseUrl` to use your own server of either kind.

## The host policy

The procedures that use the network send their requests with the `fetch` of the module. The default is the global `fetch`, so the root stays safe for a browser. The map data procedures also read `text()` and the headers of the response.

A Node host that serves other callers gives `createHostFetch()` of `@procedures/http` to `createGeoModule()`. Then the host policy examines each `baseUrl` and each `layerUrl`. It refuses a loopback, private or link-local address, unless the `allow` list of the host has it:

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
