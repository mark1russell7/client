---
"@procedures/collections": patch
---

Add the option `keepAfter` of `UndoLog`. Each entry then keeps the values after its change at the touched paths in `afterValues`, so a caller can merge a later write with the undo. The default stays as before.
