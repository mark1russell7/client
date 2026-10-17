---
"@procedures/store": patch
---

`FileQueueStore.load` names the right line in its "not JSON (line N)" error when blank lines come before the bad line. Before, it counted the lines after it had removed the blank ones.
