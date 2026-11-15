---
"@procedures/client": patch
---

The admission examines each nested call that its caller does not declare. A procedure of code with declared effects answers for a nested call only in one case. An entry of its `metadata.calls` names the callee, and the effects of the callee are in its declaration. `checkEffects()` examines the same edges. Before, such a procedure answered for each of its nested calls, also without `calls`.

Declare each nested callee of a procedure of code in `metadata.calls`. A nested call that the caller does not declare passes only when the capability permits the callee as a direct call.

`examinesNestedCall()` gets the optional parameter `callee`. Without it, the function gives true.

PATCH: a fix of the admission, and a new optional parameter.
