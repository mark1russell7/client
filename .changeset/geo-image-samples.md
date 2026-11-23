---
"@procedures/geo": patch
---

`@procedures/geo` reads the values of an ArcGIS image service at points (`getSamples`), for example the USGS 3DEP elevation. The pure function `imageSamplesExchange` builds the request, and `imageSamples` reads the answer. `ELEVATION_URL` and `ELEVATION_ATTRIBUTION` give the 3DEP service and its citation.
