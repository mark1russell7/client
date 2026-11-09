---
"@procedures/http": patch
---

`createHostFetch` gives the `headers` of the response, and takes the option `method: "HEAD"`. A `HEAD` request reads only the headers. Thus a caller of `frameRefusal` does not read the body of a large page.
