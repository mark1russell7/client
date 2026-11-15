---
"@procedures/fs": patch
---

`fs.temp` makes its folder in the base folder for each prefix. The prefix is only the start of the folder name, so the prefixes `.` and `..` also make a folder in the base folder. With a root, the base folder is `.tmp` of the root.
