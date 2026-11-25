---
"@procedures/ocr": patch
---

When `pdftotext` or `pdftoppm` fails and its output comes from Xpdf, not from Poppler, the call fails with an `OcrToolMissingError` with `other: "Xpdf"`. The error tells you to install Poppler or to set `POPPLER_PATH`. Before, the call failed with the usage text of Xpdf. The new field `others` of a `ProgramSpec` lists the different programs with the same name, and the new export `XPDF` describes Xpdf.
