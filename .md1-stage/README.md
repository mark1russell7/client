# @procedures/media

Media documents: a small JSON record now, and its files later.

A media document has two parts. `$data` is the record of the app. `$media` is the table of its files.

```json
{
  "$media": {
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08": {
      "path": "/photos/0",
      "type": "image/jpeg",
      "size": 48213,
      "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "state": "pending"
    }
  },
  "$data": { "title": "Shelf 3", "photos": ["9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"] }
}
```

- The key of each entry is the id of the file: the SHA-256 of its bytes, as 64 lowercase hex characters.
- `path` is a JSON Pointer (RFC 6901) into `$data`. At that pointer, `$data` holds the id.
- `state` is `pending`, `partial`, `complete`, `embedded` or `linked`.
- A `partial` entry has `received`, an `embedded` entry has `base64`, and a `linked` entry has `url`.

Because the id is the hash of the bytes, an upload is idempotent. A reader can show the record before its files are complete.

## The steps of an upload

1. The client adds each file with `addMedia`. The function puts the id at the path in `$data`.
2. The client sends the small document from `stripMedia`. The server stores it at once.
3. The server answers with `missingIds`: the files that its store does not have.
4. The client sends each missing file in the chunks of `planChunks`. After a cut, the plan has only the chunks that did not arrive.
5. The server sets the count of each file with `withReceived`.

A small file can stay in the document (`embedMedia`), or it can be at a URL (`linkMedia`).

## The check

`checkMediaDocument` examines an unknown value. It gives `ok(document)`, or `err(issues)` with each problem and its JSON Pointer. `assertMediaDocument` throws a `MediaDocumentError` instead.

## Limits of this version

- The package has no hash. The caller gives the SHA-256 of each file.
- The package has only pure functions. The procedures and the store of the files come in a later version.
- The root entry has no Node.js import, so it runs in a browser.
