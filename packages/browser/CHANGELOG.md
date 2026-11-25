# @procedures/browser

## 0.68.10

### Patch Changes

- Updated dependencies [a47f3df]
- Updated dependencies [c2899fe]
  - @procedures/http@0.68.10
  - @procedures/shell@0.68.10

## 0.68.9

### Patch Changes

- @procedures/shell@0.68.9
  - @procedures/http@0.68.9

## 0.68.8

### Patch Changes

- @procedures/shell@0.68.8
  - @procedures/http@0.68.8

## 0.68.7

### Patch Changes

- 24073a8: On Windows, `findBrowser` finds Chrome and Chromium before Edge (issue #756). Edge 158 on Windows exits with the code 0 and makes no PDF file, so `renderPdf` failed on a host with Edge and Chrome. The `PATH` search of Windows also gives `chrome.exe` before `msedge.exe`. `PDF_BROWSER` and `CHROME_PATH` still come first.
- @procedures/shell@0.68.7
  - @procedures/http@0.68.7

## 0.68.6

### Patch Changes

- @procedures/shell@0.68.6
  - @procedures/http@0.68.6

## 0.68.5

### Patch Changes

- @procedures/shell@0.68.5
  - @procedures/http@0.68.5

## 0.68.4

### Patch Changes

- @procedures/shell@0.68.4
  - @procedures/http@0.68.4

## 0.68.3

### Patch Changes

- @procedures/shell@0.68.3
  - @procedures/http@0.68.3

## 0.68.2

### Patch Changes

- @procedures/shell@0.68.2
  - @procedures/http@0.68.2

## 0.68.1

### Patch Changes

- 57017a0: The new function `pdfPageCount(bytes)` gives the number of pages of a PDF file. It reads the page tree of the last trailer, the plain objects, and the object streams with no filter or with the filter `/FlateDecode`. Its time and memory grow linearly with the size of the file. A print gate uses it to make sure that each sheet of a document fits on one page.
- @procedures/shell@0.68.1
  - @procedures/http@0.68.1

## 0.68.0

### Patch Changes

- @procedures/shell@0.68.0
  - @procedures/http@0.68.0

## 0.67.0

### Patch Changes

- @procedures/shell@0.67.0
  - @procedures/http@0.67.0

## 0.66.0

### Patch Changes

- @procedures/shell@0.66.0
  - @procedures/http@0.66.0

## 0.65.0

### Patch Changes

- @procedures/shell@0.65.0
  - @procedures/http@0.65.0

## 0.64.0

### Patch Changes

- @procedures/shell@0.64.0
  - @procedures/http@0.64.0

## 0.63.0

### Patch Changes

- @procedures/shell@0.63.0
  - @procedures/http@0.63.0

## 0.62.1

### Patch Changes

- @procedures/shell@0.62.1
  - @procedures/http@0.62.1

## 0.62.0

### Patch Changes

- @procedures/shell@0.62.0
  - @procedures/http@0.62.0

## 0.61.0

### Patch Changes

- @procedures/shell@0.61.0
  - @procedures/http@0.61.0

## 0.60.1

### Patch Changes

- Updated dependencies [d472a8b]
  - @procedures/shell@0.60.1
  - @procedures/http@0.60.1

## 0.60.0

### Patch Changes

- Updated dependencies [7250ac5]
  - @procedures/shell@0.60.0
  - @procedures/http@0.60.0

## 0.59.1

### Patch Changes

- @procedures/shell@0.59.1
  - @procedures/http@0.59.1

## 0.59.0

### Patch Changes

- @procedures/shell@0.59.0
  - @procedures/http@0.59.0

## 0.58.2

### Patch Changes

- @procedures/shell@0.58.2
  - @procedures/http@0.58.2

## 0.58.1

### Patch Changes

- @procedures/shell@0.58.1
  - @procedures/http@0.58.1

## 0.58.0

### Patch Changes

- @procedures/shell@0.58.0
  - @procedures/http@0.58.0

## 0.57.0

### Patch Changes

- @procedures/shell@0.57.0
  - @procedures/http@0.57.0

## 0.56.0

### Patch Changes

- 7498bc1: `@procedures/http` has a local forward proxy that applies the host policy to each request of another program. `@procedures/browser` uses it for the new option `hostPolicy` of each render. The change adds names and is backward compatible, so it is a patch.
  
  - `startPolicyProxy({ policy, onRefusal })` starts the proxy on `127.0.0.1`, on a free port. It gives `host`, `port`, `url`, `refusals`, `requests` and `close()`.
  - The proxy takes `CONNECT` tunnels and plain requests with an absolute `http:` URL. It examines each host with `checkHost`, and connects only to the checked addresses.
  - A refused host gets the status 403. `refusals` keeps the first `MAX_PROXY_REFUSALS` refusals, and `onRefusal` gets each refusal.
  - The options `hostPolicy` and `onHostRefusal` of each render start the proxy for the run, and stop it at the end, also after an error.
  - `policyProxyArgs(proxyUrl)` gives the flags of the browser: the proxy, the bypass rule `<-loopback>`, no QUIC, no UDP for WebRTC and no DNS look-up.
  - With `hostPolicy`, a flag of `args` that can undo these flags gives an error before the browser starts.
  - A Chrome or Edge policy of the computer (`ProxySettings` or `ProxyMode`) replaces `--proxy-server` with no error. Thus a render of an `http:` or `https:` URL fails when the proxy gets no request.
  - `@procedures/browser` now depends on `@procedures/http`.
- 13996cf: An automated dependency update changes the shipped files, so this PATCH ships them.
- Updated dependencies [7498bc1]
- Updated dependencies [13996cf]
  - @procedures/http@0.56.0
  - @procedures/shell@0.56.0

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
