---
"@procedures/geo": minor
---

The Web Mercator helpers of the slippy maps: `project(lat, lon, zoom)` gives the pixel of a point, `fitZoom(points, width, height)` the zoom that fits the points into a box, and `tilesFor(topLeft, width, height, zoom)` the tiles of a view. They are pure, so a browser bundle can use them.
