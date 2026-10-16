# @procedures/privacy-scan

[![npm](https://img.shields.io/npm/v/@procedures/privacy-scan?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/privacy-scan)

This package finds private data in text before the text goes public. It finds email addresses, phone numbers, coordinate pairs and the terms of your list. Use it on code and documents before a release.

## Install

```bash
pnpm add @procedures/privacy-scan @procedures/client
```

A host registers the procedures with `createRegistry(privacyScanModule)`, or with `import "@procedures/privacy-scan/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `privacyScan.text` | none | Finds private data in a text. |
| `privacyScan.files` | reads `fs` | Finds private data in files and folders. The terms and the permitted values can also come from list files (`termsFile` and `allowFile`). |

## Example

```ts
const { findings, files } = await client.exec(["privacyScan", "files"], {
  paths: ["src", "README.md"],
  termsFile: "/home/me/.config/private-terms.txt",
  mask: true,
});
```

Each finding has `kind`, `line`, `column` and `match`. A finding of `privacyScan.files` also has `file`. The first line and the first column are 1.

## What it finds

| Kind | Rule |
| --- | --- |
| `term` | A term of the list. The match ignores case. A term that starts or ends with a letter or a digit matches only as a whole word: `Ann` does not match `Annex`. |
| `email` | An email address. An address of a domain for examples (`example.com`, `example.org`, `example.net`, `.test`, `.invalid` and `.localhost`) is not private. |
| `phone` | A `+` and 10 to 15 digits, or the North American form `(555) 555-0100`. |
| `coordinate` | A pair of decimal numbers with 4 decimals or more, as `12.3456, -65.4321`. |

- The option `kinds` sets the kinds to find. The default is all the kinds.
- The option `allow` gives the values that are not private. The scan does not report them, for each kind. The match ignores case.
- With `mask: true`, each match keeps only its first character. Use it when the output goes to a log.
- A scan of a folder does not go into `node_modules`, `.git`, `dist`, `coverage` and `.turbo`, and does not follow links.
- The scan does not examine a binary file (a file with a NUL byte). The result gives it in `skipped`.
- A path that does not exist is an error.

## Keep the term list private

The term list is private data. Keep it in a file outside the repository, and give its path with `termsFile`. Do not put the list in a repository, a log or a CI variable.

A list file has one entry on each line. A line that starts with `#` is a comment.

## Functions

The package root exports the functions of the procedures.

| Function | What it does |
| --- | --- |
| `scanText(text, options?)` | Gives the findings of a text. |
| `scanFiles(paths, options?)` | Gives the findings of files and folders, the number of files and the skipped files. |
| `readTermList(file, { optional? })` | Reads a list file. With `optional`, a missing file gives an empty list. |
| `maskMatch(text)` | Keeps the first character of a text, and puts a `*` for each other character. |
| `EMAIL_PATTERN`, `PHONE_PATTERN` and `COORDINATE_PATTERN` | The patterns of the scan. Use them with `matchAll`. |

## Limits

The scan finds only the four kinds. It does not find a name, an address or an account that is not in your list. A scan that finds nothing does not prove that a text is safe.
