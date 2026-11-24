---
"@procedures/browser": patch
---

On Windows, `findBrowser` finds Chrome and Chromium before Edge (issue #756). Edge 158 on Windows exits with the code 0 and makes no PDF file, so `renderPdf` failed on a host with Edge and Chrome. The `PATH` search of Windows also gives `chrome.exe` before `msedge.exe`. `PDF_BROWSER` and `CHROME_PATH` still come first.
