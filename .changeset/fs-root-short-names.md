---
"@procedures/fs": patch
---

The root of the file procedures accepts a path by its real path. On Windows, a folder can have a short 8.3 name (`RUNNER~1`) and a long real name. A path that used the short name was refused when the root was a link.
