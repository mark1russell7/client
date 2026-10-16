---
"@procedures/client": patch
---

The client uses `@mark1russell7/quantity` 0.2.0. Its root entry does not import zod. The entries of the client that use zod for their schemas still have it, but a bundle that takes only the Durations no longer gets zod.
