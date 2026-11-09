---
"@procedures/peer": patch
---

`staticFace()` serves the built files of a page on the listener of a procedures host, next to the procedure faces. Each path stays in the root, also through a symbolic link. A route of the page gets the fallback file when the request accepts `text/html`.

Each response has a strict frame policy by default (`DEFAULT_STATIC_HEADERS`), the headers of the options, `nosniff` and an `ETag`. A hidden path (`.env`, `.git`) gets 404, except `.well-known`. A missing root gives 404 until a build makes it. `contentTypeOf()` gives the content type of a file from its extension.
