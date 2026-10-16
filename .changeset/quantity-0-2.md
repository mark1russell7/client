---
"@procedures/client": patch
---

The client uses `@mark1russell7/quantity` 0.2.0. Its root entry does not import zod, so a bundle that uses the Durations and no zod schema is approximately 90 kB of gzip smaller.
