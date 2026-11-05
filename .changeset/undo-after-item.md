---
"@procedures/collections": patch
---

Add the option `keepAfter` of `UndoLog`. Each entry then keeps the whole item after its change in `afterItem`, so a caller can merge a later write with the undo. The default stays as before.
