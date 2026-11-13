---
"@procedures/gh": patch
---

`@procedures/gh` has a client of the REST API of GitHub for programs that send many requests: `createRestClient`. It sends each request with `httpRequest` of `@procedures/http`, so a request starts no process.

- A GET with a stored answer is a conditional request with `if-none-match`. For an answer 304, the client gives the stored answer with the status 200.
- A sliding window of `@mark1russell7/service/limiter` holds the secondary limit of 900 points in each minute. A request that changes data waits one second after the request before it.
- After a refusal for the rate, the client sends no request until the time that GitHub gives in `retry-after` or `x-ratelimit-reset`.
- No error text of the client has the token or the body of an answer.

The package has two new dependencies: `@procedures/http` and `@mark1russell7/service`.
