---
"@procedures/fs": minor
---

`fs.copy` refuses an existing destination without `overwrite`: the error has the code `EEXIST`, and the copy changes nothing. This applies to a file and to a folder, with `recursive` true or false. Before, the default copy (`recursive: true`) kept an existing file, merged a folder into an existing folder, and reported success. With `overwrite`, the copy replaces the files at the destination, as before.
