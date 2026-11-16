---
"@procedures/client": patch
---

The CORS of a procedure server accepts each request header of `HttpTransport` in a browser.

- `HttpTransport` sends each text key of the metadata as a header of its own. Before this change, the preflight answer named only a fixed list. So a call with a key of the application, with the retry middleware (`idempotency-key`) or in a batch (`Procedures-Batch`) failed in a browser.
- Without the option `allowedHeaders`, the preflight answer names the fixed list and each valid header name of `Access-Control-Request-Headers`. The answer also has `Vary: Access-Control-Request-Headers`, so a shared cache keeps one answer for each list.
- With the option `allowedHeaders`, the answer names only the headers of the option, as before.
- The fixed list also has `Procedures-Batch` and `idempotency-key`.
- Without the option `exposedHeaders`, a page can read `Procedures-Protocol`, `Procedures-Batch` and `Retry-After`. `HttpTransport` reads the batch header and `Retry-After`.
