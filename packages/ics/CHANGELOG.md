# @procedures/ics

## 0.36.0

### Patch Changes

- Updated dependencies [f1fae86]
  - @procedures/client@0.36.0

## 0.35.1

### Patch Changes

- cc80f74: PATCH: internal, no change to the public API. The procedure boilerplate of tracker item O65, after O58.
  
  - The `src/module.ts` of 37 packages gives its module and its register function with `definePackage()`. Each export keeps its name, its type and its behavior. The root and `./module` register nothing. `./register` registers in the global registry, as before.
  - The output schemas of `ics.parse`, `ics.fetch`, `json.query`, `json.patch`, `json.merge` and `yaml.parse` have the type of the declared output (`z.ZodType<T>`). The validation and the JSON Schema stay the same.
  - The `described()` helper of `@procedures/mongo` uses `typed<T>()` instead of the deprecated `zodAdapter()`. Its schemas validate and describe the input as before.
- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
  - @procedures/client@0.35.1

## 0.35.0

### Patch Changes

- @procedures/client@0.35.0

## 0.34.0

### Patch Changes

- fa1a61a: Less boilerplate in each procedure definition (dedupe review F1, tracker item O58).
  
  PATCH (pre-1.0): this change adds exports and deprecates names. It removes no export and changes no behavior.
  
  - `@procedures/client` has the new export `typed<T>()`. It is the one pass-through schema that gives only the type `T`.
  - `@procedures/client` has the new export `definePackage(name, procedures, requires?)`. It gives `{ module, register }` and registers nothing at the call. The new type `PackageDefinition` is its result.
  - `zodAdapter` is deprecated. `input()` and `output()` take each Standard Schema and infer its type, so a zod schema goes in directly.
  - `typedAnySchema` and `outputSchema` are deprecated. Use `typed<T>()`. They give the same pass-through schema.
  - The procedures of the packages give their zod schemas to `input()` and `output()` directly. The `.build() as AnyProcedure` casts are gone. The schemas, the types of the exports and the validation do not change.
  - `mark procedure new` writes `.input(<Name>InputSchema)` and `.output(<Name>OutputSchema)`, without `zodAdapter`.
  
  Migration:
  
  - The site, MiniMongo, Graph and jarvis: no change at this time. The deprecated names work until the next MINOR.
  - Before the next MINOR, replace `zodAdapter<T>(schema)` with `schema`. To keep the check of a schema against a type, write `const schema: z.ZodType<T> = ...`.
  - Before the next MINOR, replace `typedAnySchema<T>()` and `outputSchema<T>()` with `typed<T>()`.
  - A parse-only object (`{ parse }`) in `zodAdapter` becomes a Standard Schema with a `~standard` property.
- Updated dependencies [d4376c2]
- Updated dependencies [fa1a61a]
  - @procedures/client@0.34.0

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0

## 0.28.1

### Patch Changes

- 345c740: `writeIcs` writes the EXDATE of an event with a `tzid` in that zone, with the TZID and the local start time. The parser reads the EXDATE dates in the zone of the event, so a parse, a write and a parse skip the same occurrence. Before, an evening EXDATE moved to the wrong day. `IcsWriteEvent` and the input of `ics.write` get the optional field `tzid` (roadmap O57).
- 21dc858: Fixes for the security findings of the second code audit (roadmap O55).
  
  PATCH: bug fixes and additive options. Each fix refuses only an input that the documentation does not give. A caller that uses the documented behavior sees no change. A request to a loopback, private or link-local host still works, with a deprecation notice. Version 0.29.0 refuses it (decision D35).
  
  - `procedure.delete` and `procedure.define` of `@procedures/client` obey the expose rule of the host, as `procedure.get` does (R17). `procedure.delete` does not find a hidden procedure, and `procedure.define` refuses to replace one with `NOT_EXPOSED`. A new procedure at a free path stays possible, as before. Before, a caller could remove or replace a hidden procedure that the host defined.
  - The task store of `@procedures/mcp-server` keeps a task without a session (stdio, an SDK transport) apart from the HTTP sessions, both ways. Before, each HTTP session could list, read and cancel such a task.
  - `restic.run` of `@procedures/restic` refuses each input that lets the caller choose a program for restic to start: `--from-password-command`, `--password-command2`, an extended option that sets `sftp.command`, `sftp.args`, `rclone.program` or `rclone.args` (each spelling), an sftp or rclone repository whose host or remote starts with `-`, and a positional argument that starts with `-` after a last flag without a value. Before, only `--password-command` was refused.
  - `@procedures/http` exports `createHostFetch(options)`: a `fetch` for GET requests through the host policy, with the options of `createHttpModule()`. It also exports `httpSettings(options)`. The deprecated option `warnOnRefusal` keeps a refused host working: the process gets one `DeprecationWarning`, and the request goes through the global `fetch`.
  - `weather.forecast` of `@procedures/weather` sends its request through `createHostFetch()` with `warnOnRefusal`. A `baseUrl` on a loopback, private or link-local address still works, with the warning `PROCEDURES_WEATHER_PRIVATE_HOST`. `createWeatherModule({ fetch })` gives another `fetch`, for a server of the host on such an address.
  - `@procedures/geo` and `@procedures/ics` add `createGeoModule({ fetch })` and `createIcsModule({ fetch })`. Their default stays the global `fetch`, because their roots run in a browser. A refusal of the host policy keeps its code and its reason. The refusal of `ics.fetch` does not name the feed address.
  - `@procedures/bundle-assistant` exports `mcpHostModules`: the modules of `geo` and `ics` with `createHostFetch()` and `warnOnRefusal`. A refused host gets the warning `PROCEDURES_GEO_PRIVATE_HOST` or `PROCEDURES_ICS_PRIVATE_HOST`. The bundle keeps the default modules, so `mark` and the site load it next to `geo` and `ics` as before.
  - The dev-tools server of `@procedures/mcp-dev-tools` gives the `mcpHostModules` of each bundle to `createRegistry()` before the bundles. In one call, the first module of a name counts. Thus `geo.geocode`, `geo.route`, `weather.forecast` and `ics.fetch` of the dev-tools server go through the default host policy.
  
  A host that sends `weather.forecast`, or the bundle's `geo` tools, to a server on a private address can remove the warning now. It gives a `fetch` that allows the server: `createWeatherModule({ fetch: createHostFetch({ allow: ["10.0.0.5:8080"] }) })`. This `fetch` refuses each other private host now, as 0.29.0 does by default.
- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0

## 0.27.8

### Patch Changes

- 1834a5e: Fixes for the correctness findings of the second audit pass (roadmap O56).
  
  PATCH: bug fixes. A caller that used the documented behavior sees no change.
  
  - `server.call` of `@procedures/peer` with `address` closes the connection that it makes for the call: after a success, an error and an abort. Before, each call left its client, its entry in the map of the connections and, with WebSocket, an open socket.
  - `parseIcs()` of `@procedures/ics` ignores the properties of a component inside an event. Before, the UID and the SUMMARY of a VALARM (Apple and iCloud give each alarm a UID) replaced those of the event.
  - EXDATE and RECURRENCE-ID of an event with a TZID now name an occurrence by its date in that zone. Before, the occurrences were compared by their date in UTC, so an evening event in a zone west of UTC kept its excluded occurrence and showed its override next to the original. `exdates` and `recurrenceId` hold dates in the zone of `tzid`: a value in UTC or in another zone changes to it.
  - `select()` of `@procedures/collections` withdraws the receives of the cases that lose, and `merge()` keeps no receive on an input while it waits for its reader. Before, each case that lost took the next value of its channel and dropped it, and `merge()` dropped about half of the values. `select()` now also gives a value that is `undefined` (a `Channel<void>`). New: `AsyncQueue.waitTake()`, `Channel.waitReceive()` and the optional `wait` of a `SelectCase`. `merge()` takes the inputs in turn.
  - `shell.run` of `@procedures/shell` refuses an encoding that `Buffer` does not know at the validation of its input. `runCommand()` gives a failure result and `streamCommand()` throws, before they start the program. Before, the decode threw in the listener of the child, which ended the host, and the call never settled. Each encoding that worked before still works.
  - `getTree()` of `ProcedureRegistry` in `@procedures/client` no longer writes into the stored procedures. When a path is a procedure and also the namespace of longer paths, its node is a namespace, and the procedure is at the key `""` of that node. Before, a longer path wrote its segment into the stored procedure of the shorter path (a segment such as `handler` replaced its handler), or replaced the namespace.
  
  Notice of the next MINOR: it makes the ReDoS guard of `$regex` in the collection queries of `@procedures/client` stricter. The guard will refuse a pattern with a variable or overlapping repeated group, for example `(a|a)*` or `(\w+\s){2}`. Write such a pattern without the repeated group, for example `\w+\s\w+\s`. Only a host that turns `$regex` on sees the change.
- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6

## 0.27.5

### Patch Changes

- @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4

## 0.27.3

### Patch Changes

- @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0

## 0.14.1

### Patch Changes

- fc968f6: Fixed: `@procedures/geo`, `@procedures/ics` and `@procedures/splay` import `@procedures/client/browser`, not the root of `@procedures/client` (CLI-39). The root also exports `HttpServerTransport`, which imports `http`. Thus a browser build with Vite found `http` and gave a warning. The exports of the packages do not change.
  
  New: each package that operates in a browser names its browser entries in the field `client.browser` of its `package.json`. A CI check bundles each of these entries for a browser with esbuild. The check fails when an import reaches a Node built-in, with or without the prefix `node:`. The root of `@procedures/client` joins the check after CLI-6. `@procedures/splay` joins it when `splay.bridge.info` reads its version without `node:fs/promises`.
- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0

## 0.8.1

### Patch Changes

- f0bef70: When the request of `fetchCalendar` (and `ics.fetch`) fails, the error includes the system error code, for example "the request failed (ECONNREFUSED)". The code comes from the field `cause` of the error of `fetch`. The error never includes the message of the cause, because that message can include the secret address of the feed.
- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1

## 0.8.0

### Patch Changes

- 6cbc15a: Two additions for the calendar dates and the feeds.
  
  - New `shiftMonth(date, months)` gives the date `months` months after a date (`YYYY-MM-DD`). When the month of the result does not have the day, the result is its last day: one month after `2026-01-31` is `2026-02-28`. For the arithmetic of `Date.UTC`, add the days to the 1st with `shiftDay`.
  - `fetchCalendar` has a new option `fetch`, the fourth argument. It replaces the global `fetch`, as the option `fetch` of `drivingRoute` in `@procedures/geo` does.
  - The README lists `localTime`, `weekdayOf` and `weekdayName`, which came in 0.7.0.
- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0

## 0.7.0

### Minor Changes

- 01dce14: `localTime(instant, timeZone)` gives the time (`HH:MM`, 24 hours) that a clock in a zone shows at an instant. `weekdayOf(date)` gives the day of the week (0 for Sunday), and `weekdayName(date)` its name. jarvis had seven copies of these.

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0

## 0.6.0

### Minor Changes

- 901c238: New functions for calendar days. They use `Intl` only, as `@procedures/schedule` does.
  
  - `localDate(instant, timeZone)` gives the date (`YYYY-MM-DD`) of an instant in an IANA time zone.
  - `zonedOffset(date, time, timeZone)` gives the UTC offset (`+HH:MM` or `-HH:MM`) of a local time, with the rules of RFC 5545.
  - `shiftDay(date, days)` gives the date some days after a date, with the arithmetic of UTC.
  - `daysBetween(from, to)` gives the number of whole days from one date to another.
  - A date, a time, an instant or a time zone that is not correct throws a `RangeError`.
  
  A correction of the reader: `zonedToUtc` and the `TZID` times of `parseIcs` follow RFC 5545 (3.3.5).
  
  - A local time in the gap of the change to daylight time uses the offset before the gap. 02:30 on 2026-03-08 in `America/New_York` becomes 07:30 UTC (03:30 daylight time). Before, it became 06:30 UTC (01:30 standard time).
  - A local time that occurs two times gives its first occurrence. 02:30 on 2026-10-25 in `Europe/Berlin` becomes 00:30 UTC. Before, a zone east of UTC gave the second occurrence (01:30 UTC).
  - The other local times do not change.

### Patch Changes

- @procedures/client@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Minor Changes

- 0f1d06e: New iCalendar writer. The function `writeIcs(events, options)` and the pure procedure `ics.write` write a calendar from events. The reader `parseIcs` reads the text back to the same events.
  
  - The writer writes `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `LOCATION`, `DESCRIPTION`, `URL`, `RRULE`, `EXDATE`, `STATUS` and `SEQUENCE`. Each time is in UTC. An all-day event gets `VALUE=DATE`.
  - The options set `PRODID`, `METHOD`, `CALSCALE`, `X-WR-CALNAME` and the `DTSTAMP`. `VERSION` is always `2.0`.
  - The writer escapes `\`, `;`, `,` and each line break in a text value. It folds each line at 75 octets of UTF-8 and does not divide a character. Each line ends with CRLF.
  - The package also exports `escapeText`, `foldLine`, `formatUtc` and `formatDate`.
  
  Two corrections of the reader:
  
  - `unescapeText` reads each escape one time from left to right. Before, an escaped backslash before an `n` (`C:\\new`) became a line break.
  - The reader decodes the escapes of a `UID`, because a `UID` is a TEXT value.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- 5e2ba76: New package: `ics.parse`, `ics.occurrences` and `ics.fetch` read an iCalendar calendar and give the occurrences of its events in a time window, recurrences included.

### Patch Changes

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
