---
"@procedures/browser": patch
---

`@procedures/browser` finds and reads the bookmarks files of the profiles of Chrome, Edge and Chromium, and gives a screenshot as bytes. The change adds names and is backward compatible, so it is a patch.

- `browserDataFolders(platform, env, home, browsers)` gives the folder of the user data of each browser on each platform.
- `findBookmarkFiles(folders, files)` finds the files `Bookmarks` and `AccountBookmarks` of each profile, with the names of the profiles.
- Each file has its browser and its size. Its id is `<browser>:<profile folder>:<file name>`, so the files of two browsers have different ids.
- `readBookmarkFile(file, files, options)` reads and parses a file. It refuses a file over `MAX_BOOKMARKS_BYTES` before the read.
- `parseChromeBookmarks(value, options)` reads the JSON of a bookmarks file. It gives the folders with their sites, and a problem for each part that it cannot read.
- The new entry `@procedures/browser/bookmarks` has the parser and its types, with no Node built-in. A page can use it.
- `renderScreenshotBytes(options)` gives the picture as a `Uint8Array`. It removes its temporary folder, also after an error.
- Each render removes its work folder through one helper. A removal that fails does not hide the result or the error of the render. Without `output`, the file is in its own temporary folder.
