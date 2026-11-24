---
"@procedures/ocr": patch
---

`ocr.page` and `ocr.image` take the optional input `upright`. With `upright: true`, tesseract finds the orientation of the page first (`--psm 0`). A page on its side is then read in the mode `--psm 1`, and each box is turned into the frame of the upright page. The result has `orientation`: the turn in the clock direction and the confidence of the engine.

The parsers have the new functions `turnText`, `turnBox` and `parseTesseractOsd`. An `OcrEngine` can have an `orientation` step. Without `upright`, the result does not change.
