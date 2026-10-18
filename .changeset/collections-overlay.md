---
"@procedures/collections": patch
---

The overlay: one logical document read through a stack of layers. `mergeCopies` merges the copies field by field (`UNSET` hides a field, `_deleted` hides the document) or takes the top copy whole. `copyAsPatch` gives a copy as the patch operations of `applyPatch`.

`resolveStacks` and `stackOf` give the read stack, the write targets and the merge mode of each collection and document. The rules name the layers with variables, and the app resolves them. Each change is additive. The code comes from Graph (its split plan, part P2).
