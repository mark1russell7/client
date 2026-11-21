---
"@procedures/browser": patch
---

The new function `pdfPageCount(bytes)` gives the number of pages of a PDF file. It reads the page tree of the last trailer, the plain objects, and the object streams with no filter or with the filter `/FlateDecode`. A print gate uses it to make sure that each sheet of a document fits on one page.
