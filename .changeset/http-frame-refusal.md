---
"@procedures/http": patch
---

`frameRefusal` tells if a browser refuses to show a page in a frame, from the headers `Content-Security-Policy` (`frame-ancestors`) and `X-Frame-Options`. `parseCsp`, `sourceAllows` and `sourceListAllows` give the parts of the CSP3 rules.
