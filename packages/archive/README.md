# @procedures/archive

[![npm](https://img.shields.io/npm/v/@procedures/archive?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/archive)

```sh
npm install @procedures/archive
```

Archives as procedures: make, list and extract tar.gz, tar and zip. The extract examines each entry before it writes a file, so a hostile archive changes nothing.

## The procedures

| Procedure | What it does | Effects |
|---|---|---|
| `archive.create` | It makes a tar.gz, tar or zip archive of a folder (`source`) or of files (`files`, relative to `cwd`). | reads and writes `fs` |
| `archive.extract` | It extracts an archive into a folder, after the check of each entry. | reads and writes `fs` |
| `archive.list` | It gives the entries of an archive: the path, the kind, the size, the mode, the time and the target of a link. | reads `fs` |

- `archive.create` and `archive.extract` declare `reads: ["fs"]` and `writes: ["fs"]`. With `overwrite: true`, they replace a file, so they are destructive.
- `archive.list` declares `writes: []`. It changes nothing.
- The format of a new archive comes from its name: `.tar.gz`, `.tgz`, `.tar` or `.zip`. The format of an existing archive comes from its first bytes.

```ts
import "@procedures/archive/register";

await client.call(["archive", "create"], { output: "dist.tgz", source: "dist" });
await client.call(["archive", "extract"], { archive: "download.zip", target: "unpacked" });
```

## The check of the extract ("zip slip")

The extract reads all the entries first. It refuses the archive, and writes nothing, when one entry breaks a rule:

1. A path must be relative. The check refuses an absolute path, a drive letter, a UNC path and `..`. A backslash counts as a separator. On Windows, the check also refuses a colon.
2. An entry must not go through a symbolic link of the archive, for example the link `a` and then the file `a/b`.
3. A symbolic link must point to a relative path in the target folder. The check follows the other links of the archive, in each order of the entries.
4. A path of a link appears only one time in the archive.
5. A hard link names a file that came before it in the archive.
6. A folder of the target that the extract goes through must not be a symbolic link.
7. Without `overwrite: true`, an existing file at the path of an entry is an error.

- Rules 2 and 3 compare the paths with the case and without the case. A file system that ignores the case gets the same protection.
- The check refuses a device, a FIFO and the other special files (`UNSUPPORTED_ENTRY`).
- With `overwrite: true`, the extract removes an old file or link before it writes the new file. A write thus does not go through a link or into a hard link.
- The tar extract also keeps the protections of node-tar: it does not write through a symbolic link, and each warning is an error.

## The root

Without a root, the procedures read and write each path that the process can reach. `createArchiveModule({ root })` confines each path of the inputs to one folder (roadmap R33). The rules are the rules of `createFsModule({ root })` of `@procedures/fs`:

```ts
import { createRegistry } from "@procedures/client";
import { createArchiveModule } from "@procedures/archive/module";

const registry = createRegistry(createArchiveModule({ root: "/srv/files" }));
```

- A relative path of an input starts at the root, not at the working folder. Without `cwd`, the files of `archive.create` start at the root.
- The archive of each procedure, the `source`, the `cwd` and the `target` must be in the root. The folder of each file of `files` must be in the root too.
- A path outside the root gives `FORBIDDEN` with the reason `outside-root`. This includes `..` out of the root, an absolute path outside it, another drive, and a symbolic link or a junction that leads out.
- The check uses the real path. For a path that does not exist yet, it uses the real path of the nearest existing folder. A link whose target does not exist yet thus cannot lead a write out of the root.
- A link in the input goes into the archive as a link. The walk does not read its target.
- The extract keeps its check of the entries in the target folder, and the target folder is in the root. An extract thus stays in the root.
- A relative root starts at the working folder of the process. The root must exist when a call starts.
- `isOutsideRoot(error)` tells the refusal of the root. On Windows, the comparison ignores the case of the letters.

## Limits

| Option | Meaning |
|---|---|
| `maxBytes` | The most bytes of the files of one archive. The default is 1 GiB. |
| `maxEntries` | The most entries of one archive. The default is 100000. |
| `root` | The folder that confines each path (refer to [The root](#the-root)). The default is no root. |

```ts
const registry = createRegistry(createArchiveModule({ maxBytes: 100 * 1024 * 1024, root: "/srv/files" }));
```

- The extract adds the declared sizes before it writes a file. An archive over a limit gives `TOO_LARGE` and changes nothing.
- The list of a tar archive stops at the limits, so a small compressed file with a very large content stops early.
- A zip entry that gives more bytes than it declares stops the extract (a zip bomb). The extract also examines the size and the CRC-32 of each zip entry.
- A damaged entry stops the extract. The files before it stay, and the extract removes the part of the damaged file.

## The formats

- Tar and tar.gz use `tar` (node-tar), the tar library of npm. The archives are portable: they have no user and no group.
- Zip uses `node:zlib`, with the reader and the writer of this package. The reader gets the attributes of each entry, so it can see a symbolic link. A zip library that decodes in memory does not give them.
- The zip reader takes stored and deflated entries, UTF-8 names and the zip64 fields. It refuses an encrypted entry, another method and an archive on more disks.
- The zip writer deflates a file when that makes it smaller. It writes no zip64 fields, so it refuses more than 65535 entries and an archive of 4 GiB or more.
- The zip writer reads each file into memory, one file at a time.
- `archive.create` does not follow a symbolic link: the archive gets the link. It leaves out the new archive when the archive is in the source.
- `archive.create` writes a temporary file next to the archive and renames it at the end. A failed call leaves no part of an archive.

## Errors

| Code | Cause |
|---|---|
| `BAD_FORMAT` | The format is not known, or the input format does not agree with the file. |
| `BAD_ARCHIVE` | The archive is damaged, or it uses a feature that this package does not read. |
| `EXISTS` | The archive, a file of the extract, or a file where the archive has a folder, exists. |
| `UNSAFE_PATH` | A path of the input or an entry is not safe. |
| `UNSAFE_LINK` | A link goes out of the target, or a hard link names no earlier file. |
| `UNSUPPORTED_ENTRY` | The archive or the source has a special file. |
| `TOO_LARGE` | The archive has more entries or more bytes than the limits. |
| `FORBIDDEN` | A path is outside the root of the module (the reason `outside-root`). |

The errors of the archives are an `ArchiveError`. Its `entry` names the entry of the archive, when an entry is the cause. The refusal of the root is an `InvocationError`, as in `@procedures/fs`.

## MCP

`archive.list` changes nothing, and it is a good tool. Without a root, `archive.create` and `archive.extract` write files in each folder that the host can reach. A host gives them to Claude only with `createArchiveModule({ root })`.

## Tests

`pnpm --filter @procedures/archive test` examines the procedures in temporary folders. The tests make hostile archives: entries with `..` and absolute paths, and links out of the target. Other hostile archives have links that escape together, a zip bomb and a wrong CRC-32.

- The tests of the root refuse each kind of path for the archive and for the target. These are `..`, an absolute path, another drive, and a link out of the root.
- The tests of a link to a folder use a junction on Windows, so they need no permission.
- The tests of a link to a file and of the links in the target folder need the permission to make a symbolic link. Windows without the developer mode thus skips them. The Windows job of the nightly workflow runs them.
