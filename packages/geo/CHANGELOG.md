# @procedures/geo

## 0.4.0

### Minor Changes

- 0f1d06e: New functions without the network: `greatCircleKm(a, b)` gives the great-circle distance in kilometres, and `geohash(point, precision)` gives the geohash of a point. `decodeGeohash(hash)` gives the edges and the center of the cell of a geohash.
  
  - `greatCircleKm` uses the haversine formula on a sphere of 6371 km (`EARTH_RADIUS_KM`). It does not round the result.
  - `geohash` gives 1 to 12 characters. The default is 7. A coordinate on the middle of a range goes to the upper half.
  - The pure procedures `geo.distance` and `geo.geohash` give the same values.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- 2a754ee: The functions `geocode`, `drivingRoute` and `getJson` of `@procedures/geo` and `sendNotification` of `@procedures/notify` take an optional `fetch`. A host can give its own fetch, for example a fetch with a cache, a recorder or a test double. The default is the global `fetch`. The types `FetchJson` and `FetchPost` give the part of `fetch` that each package uses.
  
  When a request fails, the error keeps the error of `fetch` as its `cause`, so the caller can read the code of the failure (for example `ECONNREFUSED`).
- 5e2ba76: New package: `geo.geocode` finds the coordinates of an address (Nominatim), and `geo.route` gives the time and the distance of a drive (OSRM).

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
