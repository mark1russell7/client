---
"@procedures/geo": patch
---

`@procedures/geo` has the wrap of kind 1 of its home: 42 of 48 functions of `@mark1russell7/geo` are procedures, made from the types of the home.

- The generated procedures are in the namespace `geo`, next to the hand-written `geo.geocode`, `geo.route`, `geo.distance` and `geo.geohash`. `geoModule` and `createGeoModule()` have both parts.
- The new exports `geoManifest` and `geoHomeProcedures` give the manifest and the generated procedures.
- The overlay exempts the function `geohash`, because the hand-written procedure `geo.geohash` has this name. The other 5 functions give a `GeoError` instance or a function.
- `geo.distance` is deprecated. `geo.distanceKm` with `radiusKm: 6371` gives the same value. A later MINOR of the client group removes `geo.distance`.
- The range of `@mark1russell7/geo` goes from `^0.3.1` to `^0.5.3`. The MINOR steps of 0.4.0 and 0.5.0 only add values to `GeoErrorCode`, and this package does not read that type.
- The wrap is pure. The new program `point-at-the-median-distance` of `wraps.programs.json` uses geo and statistics.

PATCH: before 1.0.0, a backward-compatible feature raises PATCH. The new procedures and exports add to the API, and each old procedure keeps its behavior.
