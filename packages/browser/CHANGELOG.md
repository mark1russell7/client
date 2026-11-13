# @procedures/browser

## 0.55.2

### Patch Changes

- a86b44f: `@procedures/browser` finds and reads the bookmarks files of the profiles of Chrome, Edge and Chromium, and gives a screenshot as bytes. The change adds names and is backward compatible, so it is a patch.
  
  - `browserDataFolders(platform, env, home, browsers)` gives the folder of the user data of each browser on each platform.
  - `findBookmarkFiles(folders, files)` finds the files `Bookmarks` and `AccountBookmarks` of each profile, with the names of the profiles.
  - Each file has its browser and its size. Its id is `<browser>:<profile folder>:<file name>`, so the files of two browsers have different ids.
  - `readBookmarkFile(file, files, options)` reads and parses a file. It refuses a file over `MAX_BOOKMARKS_BYTES` before the read.
  - `parseChromeBookmarks(value, options)` reads the JSON of a bookmarks file. It gives the folders with their sites, and a problem for each part that it cannot read.
  - The new entry `@procedures/browser/bookmarks` has the parser and its types, with no Node built-in. A page can use it.
  - `renderScreenshotBytes(options)` gives the picture as a `Uint8Array`. It removes its temporary folder, also after an error.
  - Each render removes its work folder through one helper. A removal that fails does not hide the result or the error of the render. Without `output`, the file is in its own temporary folder.
- @procedures/shell@0.55.2

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
