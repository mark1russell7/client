---
"@procedures/geo": patch
---

`@procedures/geo` reads the soil at a point from the USDA NRCS Soil Data Access service (SSURGO). The pure functions `soilQuery`, `soilExchange` and `soilComponents` give the request and read the answer. Each major component of the map unit gets its septic field rating (`ENG - Septic Tank Absorption Fields`). It also gets its low, representative and high slope, its drainage class and its hydric rating. Send the exchange with `send` of `polite-crawler/api`. The service takes only a POST, so a procedure `geo.soilAtPoint` waits for POST requests in the fetch of the module.
