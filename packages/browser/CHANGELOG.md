# @procedures/browser

## 0.55.1

### Patch Changes

- @procedures/shell@0.55.1

## 0.55.0

### Patch Changes

- Updated dependencies [2918e97]
  - @procedures/shell@0.55.0

## 0.54.1

### Patch Changes

- a3efa7e: The new package `@procedures/browser` is the home of the renders of a page with a Chromium browser that is already installed. It has `findBrowser`, one headless run for each render, `renderPdf` and the new `renderScreenshot`.
  
  - `renderScreenshot` loads an address, an HTML text or an HTML file in a window of a given size. It writes a PNG, JPEG or WebP picture of the window. The extension of the output sets the format.
  - It accepts only an `http:`, `https:` or `file:` address, so a flag cannot get into the argv of the browser.
  - The headless run is written one time. The two renders give only their flags and the check of their file.
  
  `@procedures/pdf` gives the same names again from `@procedures/browser`, so no caller breaks. Its procedure `pdf.render` does not change.
  
  PATCH: before 1.0.0, a new package and a new feature raise PATCH. The exports and the behavior of `@procedures/pdf` do not change.
- @procedures/shell@0.54.1
