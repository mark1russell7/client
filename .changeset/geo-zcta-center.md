---
"@procedures/geo": patch
---

`@procedures/geo` gives the approximate point of a US ZIP code, with no request that names the ZIP code. `zctaGazetteerUrl` gives the URL of the national ZCTA file of the Census Gazetteer for a year, from 2012. The caller downloads and unzips the whole file one time. The pure function `parseZctaGazetteer` reads its text into records with the ZCTA, the internal point and the land area. It refuses a text without the columns `GEOID`, `ALAND`, `INTPTLAT` and `INTPTLONG`. `zctaIndex` makes a map of the records, and `zipCenter` gives the point of a ZIP code from the map. `zip5` gives the 5 digits of `12345` and `12345-6789`. `ZCTA_GAZETTEER_ATTRIBUTION` and `FIRST_ZCTA_GAZETTEER_YEAR` are also new.
