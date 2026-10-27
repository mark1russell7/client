---
"@procedures/client": minor
---

`createHTTPStatusError()` gives the codes of `ERROR_REGISTRY`, as `httpStatusToErrorCode()` does. The retryable flag of `isRetryableStatus()` agrees with `ERROR_REGISTRY` (O74). This change is a break of the client group (decision D13).

`HttpTransport` uses these values when the body of an error response has no string code, for example the response of a proxy. A body with a string code keeps its code and its flag.

The codes that change:

| Status | Old code | New code | Old retryable | New retryable |
|---|---|---|---|---|
| 408 | `REQUEST_TIMEOUT` | `TIMEOUT` | true | true |
| 500 | `INTERNAL_SERVER_ERROR` | `INTERNAL_ERROR` | true | false |
| 599 | `HTTP_NETWORK_CONNECT_TIMEOUT_ERROR` | `HTTP_NETWORK_CONNECT_TIMEOUT` | true | true |

The retryable flags that change. The code of each status stays the same.

| Status | Code | Old retryable | New retryable |
|---|---|---|---|
| 421 | `MISDIRECTED_REQUEST` | false | true |
| 425 | `TOO_EARLY` | false | true |
| 501 | `NOT_IMPLEMENTED` | true | false |
| 505 | `HTTP_VERSION_NOT_SUPPORTED` | true | false |
| 506 | `VARIANT_ALSO_NEGOTIATES` | true | false |
| 508 | `LOOP_DETECTED` | true | false |
| 510 | `NOT_EXTENDED` | true | false |
| 511 | `NETWORK_AUTHENTICATION_REQUIRED` | true | false |

- 408 stays retryable: the server did not read the full request, so the call did not start. The entry `TIMEOUT` of the registry has the status 504 and `retryable: false`, because the deadline of that call passed.
- 500 is not retryable: the call can have had its effect.
- A status without an entry in the registry keeps its name from `HTTPStatusToCode`, for example `NOT_MODIFIED` for 304. A server error (5xx) without an entry stays retryable.
- `HTTPStatusToCode` stays as the names of the statuses. This release removes the `@deprecated` marks of O72 from three of its names.
- The retry middleware of the client reads the `retryable` flag. Thus it retries a 421 and a 425 without a code in the body. It does not retry a 500, 501, 505, 506, 508, 510 or 511 without a code in the body.
- `HybridStorage` of `@procedures/store` reads the flag in its default `isUnavailable`. A 500 without a code in the body does not make the storage offline at this time. The queued write stays at the head of the queue, and the next push sends it again.

Migration steps:

- Each app: search the code for `REQUEST_TIMEOUT`, `INTERNAL_SERVER_ERROR` and `HTTP_NETWORK_CONNECT_TIMEOUT_ERROR` as string error codes. Change them to `TIMEOUT`, `INTERNAL_ERROR` and `HTTP_NETWORK_CONNECT_TIMEOUT`.
- Each app: do not change `HTTPStatus.REQUEST_TIMEOUT` and the other members of the `HTTPStatus` enum. They are numbers, not error codes.
- Each app: examine each retry rule that reads the `retryable` flag of an error. Such a rule sees the new flags of the tables. To retry a 500 of a proxy, give the retry middleware a `shouldRetry` function that matches the code `INTERNAL_ERROR`.
- Each app with `HybridStorage` over HTTP: to make a 500 of a proxy offline again, give an `isUnavailable` option that also matches the code `INTERNAL_ERROR`.
- The site (`packages/site`): no step. It does not match on the three old codes, and it has no retry rule for a status.
- MiniMongo: do the steps of each app in its dev host and in its client code. Then examine the retry rules of its HTTP requests to the procedures server.
- Graph: do the steps of each app.
- jarvis: do the steps of each app in each client of `@procedures/client` that it has.
