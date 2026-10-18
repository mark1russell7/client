# @procedures/privacy-scan

## 0.8.1

### Patch Changes

- e7e41dd: The scan does not report an email address of the top-level domain `.example` (RFC 2606). Before, only `example.com`, `example.org`, `example.net`, `.test`, `.invalid` and `.localhost` were example domains. A real domain that only starts with "example", such as `examples.zz`, is still reported.
- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Minor Changes

- a01c5f3: New package: `privacyScan.text` and `privacyScan.files` find private data in text before it goes public. They find email addresses, phone numbers, coordinate pairs and the terms of a list. `privacyScan.text` is pure. `privacyScan.files` declares `reads: ["fs"]` and `writes: []`.

### Patch Changes

- ae08311: The scan starts the pattern of a term only on a line that contains the term in upper or lower case. With 875 terms, the scan is about 4 times faster. The findings do not change.
- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
