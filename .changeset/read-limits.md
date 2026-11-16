---
"@procedures/fs": patch
---

`fs.read` and `fs.read.json` get the input `maxBytes`, the largest count of bytes that the read loads. `fs.read` also gets `offset` and `length` for a part of a file.

- A part larger than `maxBytes` gives a `RangeError` with the code `ERR_FS_FILE_TOO_LARGE`. For a regular file, the error comes before the read.
- The read loads pieces of 1 MiB from one open file. Thus the limit holds also for a pipe or a file of the system with no size.
- Without `maxBytes`, the read loads the whole file, as before. The first read over 16 MiB in a process writes one warning.

Migration before 0.64.0: version 0.64.0 sets 16 MiB as the default of `maxBytes`. A caller that reads larger files sets `maxBytes` to its own limit.
