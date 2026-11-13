# @procedures/browser

[![npm](https://img.shields.io/npm/v/@procedures/browser?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/browser)

```sh
npm install @procedures/browser
```

This package finds a Chromium browser that is already on the host: Microsoft Edge, Google Chrome or Chromium. It renders a page with that browser: a PDF file or a screenshot. The package does not download a browser. It also finds and reads the bookmarks files of the Chrome profiles.

Each render uses one headless run. The run starts the browser one time, with argv, in a new temporary folder with its own profile. The renders give only their flags and the check of their file.

The package has no procedures. The procedure `pdf.render` is in [`@procedures/pdf`](../pdf).

## A screenshot

```ts
import { renderScreenshot } from "@procedures/browser";

const { path, bytes, format } = await renderScreenshot({
  url: "https://example.com/",
  output: "example.jpg",
  size: { width: 1280, height: 800 },
});
```

- Give one of `url`, `html` and `file`. The address of `url` starts with `http:`, `https:` or `file:`. The function refuses other addresses.
- The format is PNG, JPEG or WebP. The extension of `output` sets the format: `.png`, `.jpg`, `.jpeg` or `.webp`. Without `output`, the option `format` sets it, and the default is PNG.
- The option `format` and the extension of `output` must agree. Otherwise the function gives an error before it starts the browser.
- The default size of the window is 1280 by 800 CSS pixels. Each side is an integer from 1 to 16384.
- The option `budget` gives the scripts and the timers of the page more virtual time before the picture, in milliseconds. Without it, the picture follows the load event.
- The page can load each address that it names. Give an address that you trust, or a page of your own.

### A screenshot as bytes

```ts
import { renderScreenshotBytes } from "@procedures/browser";

const { data, format } = await renderScreenshotBytes({ url: "https://example.com/", format: "jpeg" });
const picture = `data:image/jpeg;base64,${Buffer.from(data).toString("base64")}`;
```

- `renderScreenshotBytes` has the options and the errors of `renderScreenshot`, with no `output`. It gives the picture as a `Uint8Array`.
- The function writes the picture to a new temporary folder, and reads it. Then it removes the folder, also after an error.
- The option `folder` sets the folder that gets the temporary folder. The default is the temporary folder of the system.

## A PDF file

```ts
import { renderPdf } from "@procedures/browser";

const { path, bytes } = await renderPdf({ html: "<h1>Menu</h1><p>Soup of the day</p>", output: "menu.pdf" });
```

- Give `html` or `file`, not the two.
- After the print, the function examines the file. A file that does not start with `%PDF` gives an error.

## The options of each render

| Option | What it does |
|---|---|
| `output` | The path of the file. The default is a file in a new temporary folder. The caller moves or deletes it. |
| `executable` | The browser program. When it is set, the search does not occur. |
| `args` | More flags for the browser, after the default flags. A browser that runs as root, for example in a container, needs `["--no-sandbox"]`. |
| `timeout` | The time limit, in milliseconds. The default is 60000. |
| `signal` | When the signal aborts, the browser stops. |
| `runner` | The function that runs the browser. The default is `runCommand` of `@procedures/shell`. The tests give their own. |

- The browser starts through `runCommand` of `@procedures/shell`, not through a shell. At the time limit, or when the signal aborts, `runCommand` stops the process tree of the browser.
- The temporary profile keeps the render apart from a browser that the user has open.
- A missing file, an empty file or a file of the wrong kind gives an error.
- An existing output file changes only after the check of the new file. Thus a failed render keeps an old output file.

## The browser

`findBrowser(options)` gives the path of the browser program, or `undefined`. The search uses the first of these:

1. The option `executable`.
2. The environment variable `PDF_BROWSER`, then `CHROME_PATH`.
3. On Windows: Edge, then Chrome, in `Program Files`, `Program Files (x86)` and `LOCALAPPDATA`.
4. On macOS: the app bundles of Chrome, Edge and Chromium in `/Applications` and `~/Applications`.
5. The `PATH`: `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`, `microsoft-edge` and `microsoft-edge-stable`. On Windows, `msedge.exe` and `chrome.exe`.

When the search finds no browser, each render gives an error that names `PDF_BROWSER`. The name comes from `@procedures/pdf`, the first home of the search.

## The bookmarks of Chrome

```ts
import { homedir } from "node:os";
import { chromeDataFolders, findBookmarkFiles, MAX_BOOKMARKS_BYTES, parseChromeBookmarks } from "@procedures/browser";

const files = await findBookmarkFiles(chromeDataFolders(process.platform, process.env, homedir()));
for (const file of files) console.log(file.id, file.name, file.kind, file.path);
```

- `chromeDataFolders(platform, env, home)` gives the folder of the user data of Google Chrome on Windows, macOS and Linux. It reads no file.
- `findBookmarkFiles(folders, files)` finds the files `Bookmarks` and `AccountBookmarks` of each profile. It reads the names of the profiles from the file `Local State`.
- The profiles come in the order of Chrome: `Default` first, then `Profile <n>` by the number. The guest and system profiles have no bookmarks.
- The id of a file is `chrome:<profile folder>:<file name>`. A host can give the id and the name to a page, and keep the path.
- The argument `files` is the file access of the search. The default is `diskFileAccess`. A test gives files in memory.

`parseChromeBookmarks(value, options)` reads the JSON of a bookmarks file. It gives the root folders, each with its folders and its sites.

- Each site has its address, its title, the time when the user added it, and the names of its folders as `path`.
- The parser keeps only the `http` and `https` addresses. The count `skipped` tells how many other bookmarks the file has.
- A part that the parser cannot read gives a problem in `problems`. The parser reads the other parts.
- The option `prefix` goes before each key of a folder. Give two files different prefixes, so that their keys are different.
- The parser reads 100 folders deep at most (`MAX_BOOKMARK_DEPTH`). A deeper folder gives a problem.
- A value with no object `roots` is not a bookmarks file. Then the parser throws.
- `MAX_BOOKMARKS_BYTES` is the largest file that a reader accepts: 64 MB. Examine the size before the read.

### The entry for a page

The entry `@procedures/browser/bookmarks` imports no Node built-in, so a page can use it. It has the parser and its types, not the search.

```ts
import { parseChromeBookmarks, type ChromeBookmarks } from "@procedures/browser/bookmarks";

const read: ChromeBookmarks = parseChromeBookmarks(JSON.parse(await chosenFile.text()), { prefix: "file:1:" });
```

## The other functions

- `browserCandidates(platform, env)` gives the paths that the search examines.
- `pdfArgs(page, output, profile, extra)` gives the argv of a print.
- `screenshotArgs(page, output, profile, size, budget, extra)` gives the argv of a screenshot.
- `screenshotFormatOf(output, format)` gives the format of a screenshot.
- `isPdfFile(path)` tells if a file starts with `%PDF`.
- `isImageFile(path, format)` tells if a file starts with the signature of a PNG, JPEG or WebP file.
- `chromeTime(value)` gives the ISO 8601 time of a Chrome time: a text of the microseconds from 1601-01-01.
- `profileNames(localState)` gives the name of each profile from the JSON of the file `Local State`.
