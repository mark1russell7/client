---
"@procedures/geo": patch
---

`@procedures/geo` finds the point of a street address in the features of `geo.osmFeatures`, with no request to a geocoder. The pure function `locateAddress` gives the point of an element with the number. Else it interpolates the number along the street line, and gives the error of the method on the known numbers (each element removed in turn). `normalizeStreet` and `STREET_WORDS` compare the street names of the United States. `parseStreetAddress`, `houseNumbers` and `townBox` are also new. The lines come from `joinLines` and `lineReference` of `@mark1russell7/geo` 0.5.5, and the fit from `leastSquares` of `@mark1russell7/rigor-statistics`. The new generated procedures `geo.joinLines`, `geo.nearestOnLine` and `geo.pointAlongLine` call the new functions of `@mark1russell7/geo` 0.5.5.
