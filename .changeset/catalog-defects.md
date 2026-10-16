---
"@procedures/client": patch
---

The catalog test of the core procedures found four defects (roadmap R29). `client.replace` gives the replacement as text: before, the replacement of the first match changed `$$` to `$` and `$&` to the match. `client.groupBy` accepts a group with the name of a field of `Object.prototype`: before, a group `constructor` or `toString` failed. `client.arrPick` picks only own fields, as `client.pick` does: before, `toString` picked a function of the prototype. The input schema of `client.template` describes its `{{name}}` placeholders: before, it described `{name}`.
