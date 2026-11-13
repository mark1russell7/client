---
"@procedures/browser": patch
---

`@procedures/browser` finds and reads the bookmarks files of the Chrome profiles, and gives a screenshot as bytes. The change adds names only, so it is a patch.

- `chromeDataFolders(platform, env, home)` gives the folder of the user data of Google Chrome on each platform.
- `findBookmarkFiles(folders, files)` finds the files `Bookmarks` and `AccountBookmarks` of each profile, with the names of the profiles.
- `parseChromeBookmarks(value, options)` reads the JSON of a bookmarks file. It gives the folders with their sites, and a problem for each part that it cannot read.
- The new entry `@procedures/browser/bookmarks` has the parser and its types, with no Node built-in. A page can use it.
- `renderScreenshotBytes(options)` gives the picture as a `Uint8Array`. It removes its temporary folder, also after an error.
