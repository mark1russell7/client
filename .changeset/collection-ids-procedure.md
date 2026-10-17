---
"@procedures/client": patch
"@procedures/store": patch
"@procedures/collections": patch
---

`ApiStorage` has `getIds()`. A full pull through it does not read each entry for the ids.

- The collections have the procedure `collections.<name>.ids`. It gives the ids in the order of the entries, without the values. Its effects read the collection and write nothing. A storage without `getIds()` gives the ids of its entries.
- The `CollectionStorage` of the core has the optional method `getIds()`, as the `CollectionStorage` of `@procedures/collections` has.
- `ApiStorage.getIds()` uses the procedure `ids`. An older server without it answers `NOT_FOUND`. Then the storage reads the ids from the entries, and it does not ask for `ids` again.
- `ApiStorageOptions.operations` takes `ids`, the name of the operation. The default is `ids`.
