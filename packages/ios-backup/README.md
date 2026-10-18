# @procedures/ios-backup

[![npm](https://img.shields.io/npm/v/@procedures/ios-backup?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/ios-backup)

This package reads an iPhone backup in the MobileSync format. It finds the newest backup, finds a file in `Manifest.db` and reads the messages of `sms.db`. The package has no native dependency. It reads SQLite with `node:sqlite`.

## Install

```bash
pnpm add @procedures/ios-backup @procedures/client
```

The package needs Node 22.13 or later. Before 22.13, `node:sqlite` is not available without a flag.

A host registers the procedures with `createRegistry(iosBackupModule)`, or with `import "@procedures/ios-backup/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `iosBackup.find` | reads `fs` | Lists the backup folders in the roots, the newest first. |
| `iosBackup.file` | reads `fs` | Finds a file of a backup from its domain and its relative path in `Manifest.db`. |
| `iosBackup.messages` | reads `fs` | Reads the messages (iMessage and SMS) of a backup, in time order. The filters are `since`, `until` and `limit`. |

Without `backup`, a procedure uses the newest backup in `roots`. The default roots are the MobileSync folders of the Apple Devices app and iTunes on Windows, and of Finder on macOS.

## Example

```ts
const { backup, messages } = await client.exec(["iosBackup", "messages"], { since: "2026-01-01T00:00:00Z", limit: 100 });
```

Each message has `guid`, `date`, `text` and `is_from_me`. When the database has the data, it also has `handle`, `service`, `chat_id` and `chat_name`. The names are the column names of `sms.db`.

## Functions

The package root exports the functions of the procedures.

| Function | What it does |
| --- | --- |
| `listBackups(roots?)` | Lists the backup folders, the newest first. |
| `findLatestBackup(roots?)` | Gives the path of the newest backup folder, or `undefined`. |
| `findBackupFile(backup, domain, relativePath)` | Gives the `fileId` and the path of a file, or `undefined` when `Manifest.db` does not list it. |
| `readMessages(backup, query?)` | Reads the messages of a backup folder. |
| `readSmsDatabase(file, query?)` | Reads the messages of a messages database file, for example `chat.db` of macOS. |
| `appleDateToIso(raw)` and `isoToAppleDate(iso)` | Change an Apple time (after 2001-01-01) to an ISO 8601 string, and back. |
| `extractTypedstreamText(body)` | Gets the plain text from the `attributedBody` column of a message. |

## How it reads

- The package copies `Manifest.db` and `sms.db` to a temporary folder, reads the copies and deletes them. It changes nothing in the backup.
- An error of the package is an `IosBackupError`. Its `code` is `no-backup`, `encrypted`, `no-file`, `missing-file` or `invalid-file-id`. `invalid-file-id`: `Manifest.db` gives a file name that is not a hash of 40 hexadecimal digits, so the name could leave the backup folder.
- The package cannot read an encrypted backup. Make a backup without encryption to read the messages.
- When the `text` column of a message is empty, the package reads the text from its `attributedBody` column. Such a message has `from_attributed_body: true`.
- The times are ISO 8601 strings in UTC, to the second. The package reads the times in nanoseconds (iOS 11 and later) and in seconds (older databases).
- The package loads `node:sqlite` at the first read. Thus an import of the package does not show the experimental warning of Node.

## The root of the files

A host with a root (`mark --fs-root`, `procedure-server --fs-root`, `MCP_FS_ROOT`) refuses the three procedures with `FORBIDDEN` and the reason `outside-root`. The default backups are in the home folder. The procedures follow a linked backup folder, and the names of the files come from the data of `Manifest.db`.

## Privacy

A backup holds the private messages of a person and of the people who write to that person. Read a backup only with permission. Do not send the messages to a service that you do not control.
