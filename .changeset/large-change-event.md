---
"@procedures/mongo": patch
---

A change event over the BSON limit of 16 MiB no longer stops the change watchers in a loop (CLI-107).

- `watchDatabaseChanges()` and `watchStorageChanges()` end the pipeline of each stream with the stage `$changeStreamSplitLargeEvent`, and join the fragments of a large event into one event. The new option `splitLargeEvents` (default `true`) turns the stage off.
- A server before 6.0.9 does not know the stage (code 40324). The watchers then open the stream again without it.
- An error with one code at one resume token, 5 times in a row, does not go away. `watchDatabaseChanges()` then stops and gives `onError` an error that has the fields `code`, `resumeToken` and `cause`. `watchStorageChanges()` opens the stream again without the token, and the subscribers get a gap. A network error and an error that the driver resumes do not count.
- `watchStorageChanges()` no longer starts its backoff again when a stream opens again at the same token.
- The hints stream of `watchStorageChanges()` no longer loses the error of a failed read behind the close of the stream. So the bound of 5 errors counts it.
