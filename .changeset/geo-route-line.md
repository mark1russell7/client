---
"@procedures/geo": patch
---

`drivingRoute` and the procedure `geo.route` take a new option `line`: `"full"` or `"simplified"`. With it, the result also has `line`, the points of the route from the start to the destination (the GeoJSON line of OSRM). Use it, for example, to find the bridges on a route. Without the option, the request and the result do not change.
