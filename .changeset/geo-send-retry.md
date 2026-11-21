---
"@procedures/geo": patch
---

`geo.osmFeatures` and `geo.arcgisFeatures` send a request again after a 429, 502, 503 or 504, when the pace ends the park of the host. They send a request at most 3 times. `geoSend` has the new option `attempts`, and the package exports `TRANSIENT_STATUSES` and `DEFAULT_ATTEMPTS`.
