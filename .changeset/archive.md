---
"@procedures/archive": minor
---

The new package `@procedures/archive` (roadmap R46) has three procedures: `archive.create` (a tar.gz, tar or zip archive of a folder or of files), `archive.extract` and `archive.list`. `create` and `extract` declare `reads: ["fs"]` and `writes: ["fs"]`. `list` declares `writes: []`.

The extract examines all the entries before it writes a file ("zip slip"). It refuses `..`, absolute paths, drive letters and UNC paths, an entry through a link of the archive, a symbolic link out of the target (also links that escape together, in each order), a hard link to no earlier file, a special file, a link in the target folder on the way, and an existing file without `overwrite`. The link checks compare the paths with the case and without the case. An archive over the limits (`maxBytes`, default 1 GiB, and `maxEntries`, default 100000) gives `TOO_LARGE` and changes nothing.

Tar and tar.gz use `tar` (node-tar). Zip uses `node:zlib` with the reader and the writer of this package: the reader sees symbolic links, reads the zip64 fields, and stops a zip entry that gives more bytes than it declares. `createArchiveModule({ maxBytes, maxEntries })` gives the procedures with other limits.
