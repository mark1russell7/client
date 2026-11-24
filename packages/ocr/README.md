# @procedures/ocr

[![npm](https://img.shields.io/npm/v/@procedures/ocr?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/ocr)

The text of a PDF page or of an image, as lines and words. Each line and each word has its text, its confidence from 0 to 1 and its box. The package reads the text layer of a PDF page first. It uses OCR only for a page with no text layer.

The package uses the programs of the host. It does not download a program:

- `pdftotext` and `pdftoppm` of Poppler, for the PDF pages.
- `tesseract` 4 or later, the first OCR engine.

Each program starts as argv through the procedure `shell.run` of `@procedures/shell`. No shell starts.

## Install

```sh
pnpm add @procedures/ocr
```

Install the programs:

| Host | Poppler | Tesseract |
|---|---|---|
| Debian or Ubuntu | `apt install poppler-utils` | `apt install tesseract-ocr` |
| macOS | `brew install poppler` | `brew install tesseract` |
| Windows | A Poppler build, with `POPPLER_PATH` set to its `bin` folder | The Tesseract installer |

## The procedures

| Procedure | What it does | Effects |
|---|---|---|
| `ocr.page` | It gives the text of one page of a PDF file. The boxes are in PDF points. | It reads `fs` and `process`. It writes `fs` (a temporary image) and `process`. |
| `ocr.image` | It reads the text of an image file with the OCR engine. The boxes are in the pixels of the image. | It reads `fs` and `process`. It writes `process`. |

`ocr.page` has three modes:

- `auto` (the default): the text layer of the page. A page with no word in its text layer gets OCR.
- `text`: only the text layer.
- `ocr`: always OCR. `pdftoppm` makes an image of the page at `dpi` (default 300). Then the engine reads the image.

```ts
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { ocrModule } from "@procedures/ocr/module";

const registry = createRegistry(ocrModule);
const page = await outputValue(await invokePath(["ocr", "page"], { file: "report.pdf", page: 2 }, { registry }));
// { page: 2, source: "text-layer", unit: "pt", width: 612, height: 792, text: "...", confidence: 1, lines: [...] }
```

From the `mark` CLI:

```sh
mark ocr page report.pdf --page 2
mark ocr image photo.png --language eng+deu
```

## The result

Each result has `unit`, `width`, `height`, `text`, `confidence` and `lines`. Each line has `text`, `confidence`, `box` and `words`. Each word has `text`, `confidence` and `box`.

- A box is the `Rect` record of `@mark1russell7/layout-contract`: `x` and `y` are the top-left corner, `w` and `h` are the size. The y axis points down.
- A word of the text layer has the confidence 1. A word of OCR has the confidence of the engine, divided by 100.
- The confidence of a line is the mean of its words. The confidence of the result is the mean of all words.

## The programs on the host

The procedures find each program at each call. A host can set the path of each program with `createOcrModule`. The input of a call cannot choose a program.

```ts
import { createOcrModule } from "@procedures/ocr/module";

const registry = createRegistry(createOcrModule({ executables: { tesseract: "/opt/tesseract/bin/tesseract" } }));
```

The search examines these paths, in this order:

1. The `executables` option of `createOcrModule`.
2. The environment variable of the program: `TESSERACT_EXE`, `PDFTOTEXT_EXE` or `PDFTOPPM_EXE`.
3. For Poppler, the folder of `POPPLER_PATH`.
4. The install folders: `Tesseract-OCR` and `poppler\Library\bin` in the program files folders of Windows, and the Homebrew folders of macOS.
5. The folders of the `PATH`.

When the search finds no program, the call fails with an `OcrToolMissingError`. The error has the name of the program (`tool`), the paths that the search examined (`searched`) and the code `OCR_TOOL_MISSING`. A program that does not start gives the same error.

## The parsers

The parsers start no process and read no file. The root and the entry `@procedures/ocr/parse` export them. A browser can also load the entry `./parse`.

- `parseTesseractTsv(tsv)` reads the TSV output of tesseract (`tesseract <image> stdout tsv`).
- `parsePdftotextBbox(xhtml)` reads the output of `pdftotext -bbox-layout` for one page.
- `scaleText(text, factor, unit)` changes the unit of the boxes. For example, the factor `72 / 300` changes the pixels of an image at 300 dots per inch to PDF points.

## Other engines

An OCR engine is an `OcrEngine` adapter: a program, the argv for one image and the parse of its output. `tesseractEngine` is the first adapter. Give another adapter to `createOcrModule({ engine })`.
