---
"@procedures/geo": patch
---

The procedures `geo.distance` and `geo.geohash` use `@mark1russell7/geo`, the home of the plain functions of geography. Their outputs do not change.

- `geo.distance` gives `distanceKm(from, to, EARTH_RADIUS_KM)` of `@mark1russell7/geo`. The formula, the radius of 6371 km and the rounding are the same, so each value is the same.
- `geo.geohash` gives `geohash` and `decodeGeohash` of `@mark1russell7/geo`. Its input schema accepts only points on the map, so each output is the same.
- The plain functions `greatCircleKm`, `geohash` and `decodeGeohash`, the type `GeohashCell` and the geohash constants of this package are deprecated. Use the exports of `@mark1russell7/geo`.
- The deprecated functions keep their old checks. `geohash` throws a `RangeError` for a longitude out of -180 to 180. `decodeGeohash` reads the KELVIN SIGN (U+212A) as a `k`.
- The functions of `@mark1russell7/geo` are different. `geohash` puts a longitude out of -180 to 180 into that range. `decodeGeohash` refuses each character that is not ASCII. `distanceKm` throws a `RangeError` for a latitude off the map or a value that is not finite.
- The deprecated exports go at the next MINOR of the client group. That change is the break.

To prepare, import `distanceKm`, `geohash`, `decodeGeohash` and `GeohashCell` from `@mark1russell7/geo`. For the old radius, give `EARTH_RADIUS_KM` of this package as the third argument of `distanceKm`.
