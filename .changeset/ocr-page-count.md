---
"@procedures/ocr": patch
---

The new procedure `ocr.pageCount` gives the number of pages of a PDF file. A caller can then read each page with `ocr.page`, from page 1 to that number.

- The count comes from `pdfinfo` of Poppler, through `shell.run` with argv. `ocr.page` uses the same Poppler programs, so each page in the count is a valid page of `ocr.page`.
- The input is `{ file, timeout? }`, and the output is `{ pages }`. The effects are the effects of `ocr.image`: it reads `fs` and `process`, and it writes `process`.
- The new exports are `ocrPageCount`, `pdfinfoArgs`, `parsePdfinfoPages` (also on the entry `./parse`), `PDFINFO`, `OcrPageCountInput`, `OcrPageCountOutput` and their schemas.
- The search finds `pdfinfo` as the other programs of Poppler: `executables.pdfinfo`, then `PDFINFO_EXE`, then `POPPLER_PATH`, the install folders and the `PATH`.

PATCH: before 1.0.0, a backward-compatible feature raises PATCH. The other procedures do not change.
