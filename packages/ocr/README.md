# @procedures/ocr

[![npm](https://img.shields.io/npm/v/@procedures/ocr?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/ocr)

The text of a PDF page or of an image, as lines and words. Each line and each word has its text, its confidence from 0 to 1 and its box. The package reads the text layer of a PDF page first. It uses OCR only for a page with no text layer.

The package uses the programs of the host. It does not download a program:

- `pdftotext`, `pdftoppm` and `pdfinfo` of Poppler, for the PDF pages.
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
| `ocr.pageCount` | It gives the number of pages of a PDF file, from `pdfinfo`. | It reads `fs` and `process`. It writes `process`. |

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

To read each page of a file, get the number of pages with `ocr.pageCount` first. The pages of `ocr.page` are the numbers from 1 to that number.

```ts
const { pages } = await outputValue(await invokePath(["ocr", "pageCount"], { file: "report.pdf" }, { registry }));
for (let page = 1; page <= pages; page += 1) {
  const text = await outputValue(await invokePath(["ocr", "page"], { file: "report.pdf", page }, { registry }));
}
```

From the `mark` CLI:

```sh
mark ocr page report.pdf --page 2
mark ocr image photo.png --language eng+deu
mark ocr pageCount report.pdf
```

## A page on its side

A scan of a wide table is often on its side. Give `upright: true` to `ocr.page` or to `ocr.image`. Then the engine finds the orientation of the page first:

1. Tesseract finds the turn that makes the page upright (`--psm 0`). This step needs the `osd` data of tesseract. The installers of tesseract include it.
2. For a page on its side, tesseract reads the page in the mode `--psm 1`, unless the input gives `psm`. In this mode, tesseract turns the page, but it gives the boxes in the frame of the scan.
3. The procedure turns each box into the frame of the upright page. A turn of 90 or 270 degrees changes the width and the height.

The result then has `orientation`: the `turn` in the clock direction (0, 90, 180 or 270 degrees) and the `confidence` of the engine. For tesseract, a confidence below 2 is weak. A page with too few letters gives the turn 0 and the confidence 0.

```ts
const scan = await outputValue(await invokePath(["ocr", "page"], { file: "auction.pdf", page: 3, upright: true }, { registry }));
// { source: "ocr", width: 792, height: 612, orientation: { turn: 90, confidence: 2 }, lines: [...] }
```

The function `turnText(text, turn)` of the parsers does step 3 for a text from another source.

## A table

OCR gives words and lines, not cells. The pure function `tableOfText` gives the cells of a table from the boxes of its words:

1. Two words are in one row when the vertical centers of their boxes are near.
2. In a row, a wide gap between two words starts a new cell.
3. A column starts at an x position where many rows start a cell. A right-aligned column of numbers has starts that are far apart. Its cells end at the same x, so it stays one column.
4. Each word goes to the column that holds the center of its box.

```ts
import { tableOfText } from "@procedures/ocr/parse";

const table = tableOfText(scan, { minShare: 0.25 });
const prices = table.rows.map((row) => row.cells[3]?.text ?? null);
```

Each row has one cell for each column, or `null` when the row has no word in that column. Each cell has its `text`, its `confidence`, its `box` and its `words`. The tolerances are shares of the median height of the words, so the same options work for pixels and for points. Give the words of one table only: a title above the table becomes a row too.

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
2. The environment variable of the program: `TESSERACT_EXE`, `PDFTOTEXT_EXE`, `PDFTOPPM_EXE` or `PDFINFO_EXE`.
3. For Poppler, the folder of `POPPLER_PATH`.
4. The install folders: `Tesseract-OCR` and `poppler\Library\bin` in the program files folders of Windows, and the Homebrew folders of macOS.
5. The folders of the `PATH`.

When the search finds no program, the call fails with an `OcrToolMissingError`. The error has the name of the program (`tool`), the paths that the search examined (`searched`) and the code `OCR_TOOL_MISSING`. A program that does not start gives the same error.

Xpdf has programs with the names `pdftotext` and `pdftoppm`, but not the options of Poppler. For example, Git for Windows puts the `pdftotext` of Xpdf on the `PATH`. When a run fails and its output comes from Xpdf, the call fails with an `OcrToolMissingError` with `other: "Xpdf"`. The error tells you to install Poppler or to set `POPPLER_PATH`. The field `others` of a `ProgramSpec` lists these different programs with the same name.

## The parsers

The parsers start no process and read no file. The root and the entry `@procedures/ocr/parse` export them. A browser can also load the entry `./parse`.

- `parseTesseractTsv(tsv)` reads the TSV output of tesseract (`tesseract <image> stdout tsv`).
- `parsePdftotextBbox(xhtml)` reads the output of `pdftotext -bbox-layout` for one page.
- `parseTesseractOsd(output)` reads the orientation output of tesseract (`tesseract <image> stdout --psm 0`).
- `parsePdfinfoPages(output)` gives the number of pages from the output of `pdfinfo <file>`.
- `turnText(text, turn)` turns each box, the width and the height by 0, 90, 180 or 270 degrees in the clock direction.
- `tableOfText(text, options)` gives the rows and the columns of a table from the boxes of its words. Refer to [A table](#a-table).
- `scaleText(text, factor, unit)` changes the unit of the boxes. For example, the factor `72 / 300` changes the pixels of an image at 300 dots per inch to PDF points.

## Other engines

An OCR engine is an `OcrEngine` adapter: a program, the argv for one image and the parse of its output. An optional `orientation` step finds the orientation of a page. An engine with no step cannot read a page with `upright`. `tesseractEngine` is the first adapter. Give another adapter to `createOcrModule({ engine })`.
