---
"@procedures/geo": minor
---

New functions without the network: `greatCircleKm(a, b)` gives the great-circle distance in kilometres, and `geohash(point, precision)` gives the geohash of a point. `decodeGeohash(hash)` gives the edges and the center of the cell of a geohash.

- `greatCircleKm` uses the haversine formula on a sphere of 6371 km (`EARTH_RADIUS_KM`). It does not round the result.
- `geohash` gives 1 to 12 characters. The default is 7. A coordinate on the middle of a range goes to the upper half.
- The pure procedures `geo.distance` and `geo.geohash` give the same values.
