# @procedures/archive

## 0.3.0

### Minor Changes

- 808c510: The new package `@procedures/archive` (roadmap R46) has three procedures: `archive.create` (a tar.gz, tar or zip archive of a folder or of files), `archive.extract` and `archive.list`. `create` and `extract` declare `reads: ["fs"]` and `writes: ["fs"]`. `list` declares `writes: []`.
  
  The extract examines all the entries before it writes a file ("zip slip"). It refuses `..`, absolute paths, drive letters and UNC paths, an entry through a link of the archive, a symbolic link out of the target (also links that escape together, in each order), a hard link to no earlier file, a special file, a link in the target folder on the way, and an existing file without `overwrite`. The link checks compare the paths with the case and without the case. An archive over the limits (`maxBytes`, default 1 GiB, and `maxEntries`, default 100000) gives `TOO_LARGE` and changes nothing.
  
  Tar and tar.gz use `tar` (node-tar). Zip uses `node:zlib` with the reader and the writer of this package: the reader sees symbolic links, reads the zip64 fields, and stops a zip entry that gives more bytes than it declares. `createArchiveModule({ maxBytes, maxEntries })` gives the procedures with other limits.

### Patch Changes

- e9a461a: A zip archive made on Windows keeps the target of a link with `/`. Before, it kept `..\a.txt`, which is not a link target on Linux or macOS.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
