---
"@procedures/client": patch
---

The array procedures read only the own fields of an item (roadmap R29, as R6 for the object procedures). Before, a key such as `toString` read the function of the prototype: `client.count` counted each item, and `client.pluck` gave functions. This applies to `sort`, `unique`, `groupBy`, `filter`, `where`, `pluck`, `partition` and `count`.
