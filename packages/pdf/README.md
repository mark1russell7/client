# @procedures/pdf

[![npm](https://img.shields.io/npm/v/@procedures/pdf?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/pdf)

```sh
npm install @procedures/pdf @procedures/client
```

HTML to PDF with a headless Chromium browser that is already on the host: Microsoft Edge, Google Chrome or Chromium. The package does not download a browser.

A host registers the procedure with `createRegistry(pdfModule)`, or with `import "@procedures/pdf/register"` for the global registry. The package root and `./module` register nothing.

## The procedure

| Procedure | What it does | Effects |
|---|---|---|
| `pdf.render` | It prints an HTML text or an HTML file to a PDF file, and gives the path and the size of the file. | reads `fs`, `network` and `process`, writes `fs` and `process`, destructive |

- The input has `html` or `file`, not the two. It also has `output`, `executable`, `args` and `timeout`.
- Without `output`, the PDF file goes into a new temporary folder. The caller moves or deletes it.
- An existing output file is replaced. So the procedure is destructive.
- The page can load images, fonts and scripts from the network. So the procedure reads `network`.
- The caller can choose the browser program. So the procedure writes `process`.

```ts
import "@procedures/pdf/register";

const { path, bytes } = await client.call(["pdf", "render"], {
  html: "<h1>Menu</h1><p>Soup of the day</p>",
  output: "menu.pdf",
});
```

## The functions

The package root also gives the functions without a registry:

- `renderPdf(options)` prints the page and gives `{ path, bytes, browser }`. The options are the input of `pdf.render`, and `signal`, `env`, `platform` and `runner`.
- `findBrowser(options)` gives the path of the browser program, or `undefined`.
- `browserCandidates(platform, env)` gives the paths that the search examines.
- `pdfArgs(page, output, profile, extra)` gives the argv of the browser.
- `isPdfFile(path)` tells if a file starts with `%PDF`.

## The browser

The search uses the first of these:

1. The input `executable`.
2. The environment variable `PDF_BROWSER`, then `CHROME_PATH`.
3. On Windows: Edge, then Chrome, in `Program Files`, `Program Files (x86)` and `LOCALAPPDATA`.
4. On macOS: the app bundles of Chrome, Edge and Chromium in `/Applications` and `~/Applications`.
5. The `PATH`: `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`, `microsoft-edge` and `microsoft-edge-stable`. On Windows, `msedge.exe` and `chrome.exe`.

When the search finds no browser, the procedure gives an error that names `PDF_BROWSER`.

## The print

The browser starts with argv through `runCommand` of `@procedures/shell`, not through a shell:

```sh
<browser> --headless --disable-gpu --no-pdf-header-footer --user-data-dir=<temporary folder> --print-to-pdf=<output> [args] <file URL of the page>
```

- An HTML text goes into a temporary file first.
- The temporary profile keeps the print apart from a browser that the user has open.
- The default time limit is 60 seconds. At the limit, or when the signal of the call aborts, `runCommand` stops the process tree of the browser.
- After the print, the procedure examines the file. A missing file, an empty file or a file that does not start with `%PDF` gives an error.
- A browser that runs as root, for example in a container, needs `args: ["--no-sandbox"]`.
