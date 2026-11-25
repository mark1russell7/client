---
"@procedures/ocr": patch
---

The new pure function `tableOfText` gives the rows and the columns of a table from the boxes of its words. Each row has one cell for each column, with its text, its confidence and its box. A right-aligned column of numbers stays one column.
