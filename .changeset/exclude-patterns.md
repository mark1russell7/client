---
"@procedures/client": patch
---

An `exclude` entry of a host policy or of a tool surface takes the patterns of `expose`: an exact key, a prefix (`shell.*`) or `*`. A prefix entry hides each procedure under the prefix. An exact key of the form before the escape of dotted names also stays valid.
