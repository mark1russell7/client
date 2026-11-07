---
"@procedures/store": minor
---

`mergeFn` gets a fourth argument, `context` (roadmap CLI-109). `context.overlap(paths)` reports the paths where the merge kept only one side. The hook `onDropped` gets one call with the reason `overlap` for each report. The report holds `remote`, `base`, `merged` and `paths`. The merged write stays in the queue. `getMetadata()` counts the reports as `stats.overlaps`.

Migration steps for the site and each app:

- The type `DroppedWrite["reason"]` gets the value `"overlap"`. Add a case for it to each exhaustive `switch` over `reason`. Otherwise the check of `never` does not compile.
- An `onDropped` hook that writes the value again must skip the reason `overlap`. The merged write of an overlap is still in the queue.
- Code that calls a `mergeFn` itself must give a fourth argument, for example `{ overlap: () => {} }`. A merge function with two or three parameters needs no change.
