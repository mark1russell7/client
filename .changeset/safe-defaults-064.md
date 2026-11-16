---
"@procedures/client": minor
"@procedures/fs": minor
---

Three limits are on by default: the depth of the nested calls, the nested calls in a call limit, and the size of a read.

- Without `maxDepth`, a host refuses a nested call over the depth 64 with `FORBIDDEN` and the reason `depth`. Its handler does not start. Before, the handler started and the process wrote one warning. An explicit `maxDepth` of `invokeProcedure()`, `ProcedureServer` or `hostPolicy()` keeps its value.
- The new option `maxDepth` of `ClientOptions` and `LocalTransportOptions` sets the depth limit of the local calls of a `Client` and of a `LocalTransport`.
- A `CallLimit` without the field `nested` also takes the units of each nested call that it covers, as with `nested: true`. Before, it counted only the calls of a caller. The server writes no warning at the start.
- Without `maxBytes`, `fs.read` and `fs.read.json` refuse a part over 16 MiB (16777216 bytes) with a `RangeError` and the code `ERR_FS_FILE_TOO_LARGE`. Before, the read loaded the whole file and wrote one warning. For a regular file, the error comes before the read.
- This version removes the three warnings of the old defaults.

## Break

A call that worked before can fail with a new default. Migration steps for the site and each app:

1. Find each host with call trees deeper than 64. Give `maxDepth` to `hostPolicy()`, `ProcedureServer`, `invokeProcedure()`, `Client` or `LocalTransport`.
2. Find each `CallLimit` without the field `nested`. To count only the calls of a caller, give it `nested: false`.
3. Find each call of `fs.read` and `fs.read.json` for a part over 16 MiB. Give it a larger `maxBytes`.

The warnings of the earlier patch versions show each place to change.

```ts
const policy = hostPolicy({
  maxDepth: 256, // A deeper limit than the default 64
  limits: [{ ...writesPerTenant, nested: false }], // Only the calls of a caller take units
});
const log = await client.call(["fs", "read"], { path: "big.log", maxBytes: 64 * 1024 * 1024 });
```
