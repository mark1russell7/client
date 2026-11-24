---
"@procedures/geo": patch
---

`geo.arcgisFeatures` and `arcgisExchange` take two new options. `returnGeometry: false` asks the layer for features with no geometry, a smaller answer when only the fields count. `maxAllowableOffset` asks the layer to simplify each geometry, with the largest distance in degrees between a geometry and its simplified form. The defaults keep the old queries.
