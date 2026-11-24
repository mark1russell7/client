# @procedures/ocr

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
