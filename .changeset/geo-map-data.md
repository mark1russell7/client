---
"@procedures/geo": patch
"@procedures/bundle-assistant": patch
---

Two new procedures give the map data of a box as GeoJSON. `geo.osmFeatures` gives the features of OpenStreetMap that a list of tag selectors selects, through the Overpass API. `geo.arcgisFeatures` gives the features of an ArcGIS layer, page by page. Both send their requests through `polite-crawler/api`: one request in progress for each host, a rest between two requests, and a stop after a refusal. The pure parts are exported: `overpassQuery`, `osmFeatures`, `arcgisExchange`, `arcgisPage` and `isOsmArea`. The option `fetch` of `createGeoModule()` now has the type `GeoFetch`. Each `FetchJson` is a `GeoFetch`, so each host keeps its code. The new option `pace` shares the pace of other API clients. A refusal of the host policy keeps its code `FORBIDDEN` and its reason.

The two procedures are in `@procedures/bundle-assistant`, but they are not MCP tools. `geo.arcgisFeatures` reads a layer of any host, so a tool call can carry data out in the URL. `geo.osmFeatures` can give megabytes of features for one box.
