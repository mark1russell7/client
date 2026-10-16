---
"@procedures/geo": minor
"@procedures/notify": minor
---

The functions `geocode`, `drivingRoute` and `getJson` of `@procedures/geo` and `sendNotification` of `@procedures/notify` take an optional `fetch`. A host can give its own fetch, for example a fetch with a cache, a recorder or a test double. The default is the global `fetch`. The types `FetchJson` and `FetchPost` give the part of `fetch` that each package uses.

When a request fails, the error keeps the error of `fetch` as its `cause`, so the caller can read the code of the failure (for example `ECONNREFUSED`).
