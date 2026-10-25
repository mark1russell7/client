# @procedures/http

[![npm](https://img.shields.io/npm/v/@procedures/http?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/http)

```sh
npm install @procedures/http
```

HTTP requests as procedures. A host allowlist refuses loopback, private and link-local addresses by default. Each call obeys its deadline and a size limit.

## The procedures

| Procedure | What it does | Effects |
|---|---|---|
| `http.request` | It sends a request with each method and gives the status, the headers and the body. | reads and writes `network` |
| `http.json` | It sends a GET or a POST of JSON and gives the parsed body. | reads and writes `network` |
| `http.ndjson` | It sends a GET or a POST and gives a stream of the JSON values of the lines. | reads and writes `network` |
| `http.sse` | It sends a GET or a POST and gives a stream of server-sent events. | reads and writes `network` |

- Each procedure can change remote data with a POST, so each procedure declares a write. `http.request` also sends a PUT or a DELETE.
- `http.ndjson` and `http.sse` declare `stream: { unbounded: true }`, because a server can send a stream without an end. A face that collects a stream refuses them or stops them at its limits.

```ts
import "@procedures/http/register";

await client.call(["http", "json"], { url: "https://api.github.com/repos/nodejs/node" });
await client.call(["http", "request"], { url: "https://example.com/upload", method: "PUT", body: "text" });
```

### The streams of a POST

An LLM API sends its answer to a POST as server-sent events. `http.sse` and `http.ndjson` take the same request fields as `http.request`:

| Field | Meaning |
|---|---|
| `method` | `GET` or `POST`. The default is `POST` with `body` or `json`, and `GET` without them. |
| `json` | A body of JSON. The procedure sets `content-type: application/json`. |
| `body` | A body of text. The procedure sets `content-type: text/plain; charset=utf-8`. |
| `headers` | The headers of the request. A header of the input replaces a header that the procedure sets. |

```ts
const events = client.stream(["http", "sse"], {
  url: "https://api.example.com/v1/chat",
  headers: { authorization: `Bearer ${key}` },
  json: { prompt: "Hello", stream: true },
});
for await (const event of events) console.log(event.data);
```

- A POST of a stream gets the same host check, size limit of the request, time limits and deadline as the other requests.
- Two bodies, or a `GET` with a body, fail before the request.

## The hosts

The default module (`httpModule`) reaches each public host. It refuses these addresses:

- Loopback: `127.0.0.0/8` and `::1`
- Private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` and `fc00::/7`
- Link-local: `169.254.0.0/16` and `fe80::/10`, with the cloud metadata address `169.254.169.254`
- Shared, multicast, documentation, benchmarking and reserved addresses
- An IPv6 address that holds one of these IPv4 addresses: IPv4-mapped, NAT64 and 6to4

A refusal is the error `FORBIDDEN` with the reason `host-not-allowed`. A server sends the reason in the metadata key `reason`.

`createHttpModule()` gives the same procedures with other hosts:

```ts
import { createRegistry } from "@procedures/client";
import { createHttpModule } from "@procedures/http/module";

const registry = createRegistry(createHttpModule({ allow: ["localhost:11434", "10.0.0.0/8", "*.corp.example"] }));
```

| Option | Meaning |
|---|---|
| `allow` | More hosts: a host name, a wildcard (`*.example.com`), an IP address or a CIDR range. Each entry can end with a port. |
| `publicHosts` | `false`: only the hosts of `allow`. The default is `true`. |
| `maxRequestBytes` | The largest body of a request. The default is 10 MiB. |
| `maxResponseBytes` | The largest body of a response, and the maximum of each input. The default is 10 MiB. |
| `resolve` | The resolver of host names. The default is `dns.lookup`. A test gives its own resolver. |

### Rules

- A host name in `allow` lets the procedures reach each address of that name. A wildcard lets them reach the names under it, not the name itself.
- An IP address or a range in `allow` lets the procedures reach that address, also when a host name resolves to it.
- An entry without a port applies to each port. An entry with a port applies only to that port.
- The check resolves the host name and examines each address. The connection uses only the addresses that pass the check, so a second DNS answer cannot change the address.
- A name with a public address and a private address connects only to the public address.
- Each redirect goes through the same check before its connection.
- A bad entry of `allow` makes `createHttpModule()` throw.
- A host gives `createHttpModule()` to `createRegistry()` before its bundles. Then it replaces the `httpModule` in the modules of a bundle.

### The host policy in other packages

`createHostFetch(options)` gives a `fetch` for GET requests through the same checks. Its options are the options of `createHttpModule()`. A procedure of another package uses it for a URL of its caller:

- `weather.forecast` uses it by default.
- `createGeoModule({ fetch })` and `createIcsModule({ fetch })` take it. Their default stays the global `fetch`, because their roots run in a browser.
- `mcpHostModules` of `@procedures/bundle-assistant` gives it to the modules of `geo` and `ics`. The dev-tools server puts them before its bundles.

```ts
import { createHostFetch } from "@procedures/http";
import { createGeoModule } from "@procedures/geo/module";

const registry = createRegistry(createGeoModule({ fetch: createHostFetch({ allow: ["osrm.lan:5000"] }) }));
```

A refusal is `FORBIDDEN` with the reason `host-not-allowed`. When the signal of the caller aborts, the function throws the reason of the signal, as `fetch` does.

## Limits and time

- Each input of `http.request` and `http.json` has `timeoutMs`. The default is 30 seconds.
- The streams have no default time. `timeoutMs` stops the whole stream, and `idleTimeoutMs` stops a stream that gets no data.
- The deadline of the call (`ctx.capability.deadline`) and the abort of the caller (`ctx.signal`) also stop the call. The earliest event wins.
- A stop gives `TIMEOUT`, or `ABORTED` for an abort of the caller.
- `maxResponseBytes` limits the body of the response after its content encoding. The limit of the input can only be smaller than the limit of the module.
- `maxLineBytes` limits one NDJSON line, and `maxEventBytes` limits one event. The default of each is 1 MiB.
- The procedures decode `gzip`, `deflate` and `br`. The size limit counts the decoded bytes, so a small compressed body cannot fill the memory.

## Redirects

- `redirect: "follow"` is the default. `maxRedirects` is 5 by default.
- `redirect: "manual"` gives the redirect response. `redirect: "error"` fails with `REDIRECT`.
- A 303 continues with a GET without the body. A 301 or a 302 after a POST also continues with a GET. A 307 and a 308 keep the method and the body.
- A redirect to another origin removes the headers `authorization`, `cookie` and `proxy-authorization`.

## Errors

| Error | Code | Cause |
|---|---|---|
| `InvocationError` | `FORBIDDEN` | The module refuses the host (reason `host-not-allowed`). |
| `InvocationError` | `TIMEOUT` | `timeoutMs`, `idleTimeoutMs` or the deadline passed. |
| `InvocationError` | `ABORTED` | The caller aborted the call. |
| `HttpError` | `RESPONSE_TOO_LARGE`, `REQUEST_TOO_LARGE`, `LINE_TOO_LARGE`, `EVENT_TOO_LARGE` | A body, a line or an event is larger than its limit. |
| `HttpError` | `HTTP_STATUS` | `http.json`, `http.ndjson` or `http.sse` got a status outside 200 to 299. |
| `HttpError` | `BAD_JSON`, `BAD_CONTENT_TYPE`, `BAD_URL` | The response or the URL is not correct. |
| `HttpError` | `REDIRECT`, `TOO_MANY_REDIRECTS` | A redirect that the input does not permit. |
| `HttpError` | `CONNECTION` | The connection failed. |

- `http.request` gives each status. A status of 400 or more is not an error.
- `http.json` with `failOnStatus: false` gives the status. A body that is not JSON then gives its text.
- A stream procedure waits for the status. A refused host or a bad status fails the call before the first item.

## Server-sent events

- The parse obeys the rules of the HTML standard. A line ends at CR, LF or CRLF. A blank line sends an event. A line that starts with a colon is a comment.
- An event has `event` (`message` by default), `data`, the last event ID `id` and `retry`.
- The procedure does not connect again after the end of the stream. To continue, a caller sends the last ID in `lastEventId`.
- A redirect of a POST obeys the rules of the redirects. A 303, or a 301 or 302, continues with a GET without the body.

## Limits of this package

- The procedures do not use a proxy.
- Each request gets its own connection. The procedures do not keep connections open.
- The check and the connection use the same addresses. A server can still send a redirect, and the check examines it before its connection.

## Related packages

- [`@procedures/client`](../client): the core, with the capabilities and the deadline.
- [`@procedures/json`](../json): the transforms of JSON values.
