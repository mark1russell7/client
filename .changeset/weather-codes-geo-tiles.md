---
"@procedures/weather": patch
"@procedures/geo": patch
---

Two additions for maps and forecasts.

- `@procedures/weather`: new `weatherCodeGroup(code)` gives the group of a WMO weather code, for example `clear`, `fog`, `rain-showers` or `thunderstorm`. It gives `undefined` for a code that Open-Meteo does not use.
- `@procedures/geo`: new Node entry `@procedures/geo/tiles` with `cachedTile`, `isTile`, `tileUrl` and `OSM_TILES`. `cachedTile` gets a map tile one time with a real `User-Agent`, keeps it in a folder, and gives the kept file after that. The root of the package stays safe for a browser.
