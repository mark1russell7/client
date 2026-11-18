# @procedures/rational

## 0.64.0

### Patch Changes

- c56a6cf: The README of each wrap tells that the release train starts the root script `release-train:update` after it updates a general package. When the check of the wraps fails, the script writes the manifests and the catalogs again.
- Updated dependencies [6f8219e]
- Updated dependencies [bdca30d]
- Updated dependencies [dfd04b7]
- Updated dependencies [7d303f3]
- Updated dependencies [ce0d511]
- Updated dependencies [49b516e]
  - @procedures/client@0.64.0
  - @procedures/compiler@0.64.0

## 0.63.0

### Patch Changes

- Updated dependencies [3dede6e]
  - @procedures/client@0.63.0
  - @procedures/compiler@0.63.0

## 0.62.1

### Patch Changes

- 2988fba: A new wrap of kind 1, made from the types of its home, with no procedure written by hand:
  
  - `@procedures/rational`: 24 of 24 functions of `@mark1russell7/rational`, exact fractions over `bigint`. The codecs of the generator give each `bigint` as a decimal string, so a rational is `{ "n": "3", "d": "2" }` in JSON.
  
  The wrap is pure. `wraps.programs.json` has a new program across two libraries: the seconds of 0.1 h plus 0.2 h, with no rounding (rational and quantity). It gives 1080 exactly.
  
  `@procedures/quantity` uses `@mark1russell7/rational` 0.1.3, the version of the new wrap, in place of 0.1.2.
  
  PATCH: before 1.0.0, a backward-compatible feature raises PATCH. The new package adds procedures and changes no procedure of another package.
- Updated dependencies [4ce6ac9]
- Updated dependencies [02582c5]
- Updated dependencies [365aad4]
  - @procedures/compiler@0.62.1
  - @procedures/client@0.62.1
