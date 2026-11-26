# @procedures/ocr

## 0.68.13

### Patch Changes

- @procedures/client@0.68.13
  - @procedures/shell@0.68.13

## 0.68.12

### Patch Changes

- Updated dependencies [382be9d]
  - @procedures/shell@0.68.12
  - @procedures/client@0.68.12

## 0.68.11

### Patch Changes

- 0d9a5e4: The new procedure `ocr.pageCount` gives the number of pages of a PDF file. A caller can then read each page with `ocr.page`, from page 1 to that number.
  
  - The count comes from `pdfinfo` of Poppler, through `shell.run` with argv. `ocr.page` uses the same Poppler programs, so each page in the count is a valid page of `ocr.page`.
  - The input is `{ file, timeout? }`, and the output is `{ pages }`. The effects are the effects of `ocr.image`: it reads `fs` and `process`, and it writes `process`.
  - The new exports are `ocrPageCount`, `pdfinfoArgs`, `parsePdfinfoPages` (also on the entry `./parse`), `PDFINFO`, `OcrPageCountInput`, `OcrPageCountOutput` and their schemas.
  - The search finds `pdfinfo` as the other programs of Poppler: `executables.pdfinfo`, then `PDFINFO_EXE`, then `POPPLER_PATH`, the install folders and the `PATH`.
  
  PATCH: before 1.0.0, a backward-compatible feature raises PATCH. The other procedures do not change.
- @procedures/client@0.68.11
  - @procedures/shell@0.68.11

## 0.68.10

### Patch Changes

- ee0504e: The new pure function `tableOfText` gives the rows and the columns of a table from the boxes of its words. Each row has one cell for each column, with its text, its confidence and its box. A right-aligned column of numbers stays one column.
- 4b926ae: When `pdftotext` or `pdftoppm` fails and its output comes from Xpdf, not from Poppler, the call fails with an `OcrToolMissingError` with `other: "Xpdf"`. The error tells you to install Poppler or to set `POPPLER_PATH`. Before, the call failed with the usage text of Xpdf. The new field `others` of a `ProgramSpec` lists the different programs with the same name, and the new export `XPDF` describes Xpdf.
- Updated dependencies [c2899fe]
  - @procedures/shell@0.68.10
  - @procedures/client@0.68.10

## 0.68.9

### Patch Changes

- c163988: `ocr.page` and `ocr.image` take the optional input `upright`. With `upright: true`, tesseract finds the orientation of the page first (`--psm 0`). A page on its side is then read in the mode `--psm 1`, and each box is turned into the frame of the upright page. The result has `orientation`: the turn in the clock direction and the confidence of the engine.
  
  The parsers have the new functions `turnText`, `turnBox` and `parseTesseractOsd`. An `OcrEngine` can have an `orientation` step. Without `upright`, the result does not change.
- @procedures/client@0.68.9
  - @procedures/shell@0.68.9

## 0.68.8

### Patch Changes

- @procedures/client@0.68.8
  - @procedures/shell@0.68.8

## 0.68.7

### Patch Changes

- @procedures/client@0.68.7
  - @procedures/shell@0.68.7

## 0.68.6

### Patch Changes

- f2c2fa2: A new package, `@procedures/ocr`: the text of a PDF page or of an image, as lines and words. Each line and each word has its text, its confidence from 0 to 1 and its box (the `Rect` record of `@mark1russell7/layout-contract`).
  
  - `ocr.page` reads the text layer of a PDF page with `pdftotext -bbox-layout` first. Only a page with no text layer gets OCR: `pdftoppm` makes an image of the page, and tesseract reads it. The boxes are in PDF points. The modes `text` and `ocr` give only the text layer, or always OCR.
  - `ocr.image` reads an image with tesseract. The boxes are in the pixels of the image.
  - The programs start as argv through `shell.run`. The host finds each program (`executables`, then `TESSERACT_EXE`, `PDFTOTEXT_EXE`, `PDFTOPPM_EXE` or `POPPLER_PATH`, then the install folders and the `PATH`). A missing program gives an `OcrToolMissingError`.
  - The parsers `parseTesseractTsv` and `parsePdftotextBbox` start no process. A browser can also load the entry `./parse`.
  - An OCR engine is an `OcrEngine` adapter. `tesseractEngine` is the first one.
  
  PATCH: before 1.0.0, a backward-compatible feature raises PATCH. The new package adds procedures and changes no procedure of another package.
- @procedures/client@0.68.6
  - @procedures/shell@0.68.6
