# @procedures/privacy-scan

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
