# @procedures/rational

## 0.68.12

### Patch Changes

- @procedures/client@0.68.12
  - @procedures/compiler@0.68.12

## 0.68.11

### Patch Changes

- @procedures/client@0.68.11
  - @procedures/compiler@0.68.11

## 0.68.10

### Patch Changes

- @procedures/client@0.68.10
  - @procedures/compiler@0.68.10

## 0.68.9

### Patch Changes

- @procedures/client@0.68.9
  - @procedures/compiler@0.68.9

## 0.68.8

### Patch Changes

- @procedures/client@0.68.8
  - @procedures/compiler@0.68.8

## 0.68.7

### Patch Changes

- @procedures/client@0.68.7
  - @procedures/compiler@0.68.7

## 0.68.6

### Patch Changes

- @procedures/client@0.68.6
  - @procedures/compiler@0.68.6

## 0.68.5

### Patch Changes

- @procedures/client@0.68.5
  - @procedures/compiler@0.68.5

## 0.68.4

### Patch Changes

- @procedures/client@0.68.4
  - @procedures/compiler@0.68.4

## 0.68.3

### Patch Changes

- @procedures/client@0.68.3
  - @procedures/compiler@0.68.3

## 0.68.2

### Patch Changes

- @procedures/client@0.68.2
  - @procedures/compiler@0.68.2

## 0.68.1

### Patch Changes

- @procedures/client@0.68.1
  - @procedures/compiler@0.68.1

## 0.68.0

### Patch Changes

- Updated dependencies [da6b790]
- Updated dependencies [500a6cf]
  - @procedures/client@0.68.0
  - @procedures/compiler@0.68.0

## 0.67.0

### Patch Changes

- @procedures/client@0.67.0
  - @procedures/compiler@0.67.0

## 0.66.0

### Patch Changes

- @procedures/client@0.66.0
  - @procedures/compiler@0.66.0

## 0.65.0

### Patch Changes

- f1c599f: The generator of `@procedures/compiler` gives the members of a union a canonical sequence. Before, the sequence came from the type ids of TypeScript, and a new call of the checker changed it.
  
  - The `anyOf` and `enum` lists start with the primitive types. The number literals and the bigint literals follow by value. Then come the string literals by code unit. The other types come last, by the code units of their text.
  - The names of the definitions come from the same sequence. Thus a change in a different part of the generator does not rename a definition.
  - A manifest keeps only the definitions that its procedures reach through `$ref`. A function that the generator refused kept dead definitions before.
  
  The manifests of the wrap packages change only in the sequence of their lists, and lose definitions with no reference. Their schemas accept the same values.
- Updated dependencies [e7ec32b]
- Updated dependencies [4e20391]
- Updated dependencies [abf52af]
- Updated dependencies [a2a09b7]
- Updated dependencies [ffb85af]
- Updated dependencies [420ebdc]
- Updated dependencies [f1c599f]
  - @procedures/compiler@0.65.0
  - @procedures/client@0.65.0

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
