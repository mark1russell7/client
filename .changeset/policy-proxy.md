---
"@procedures/http": patch
"@procedures/browser": patch
---

`@procedures/http` has a local forward proxy that applies the host policy to each request of another program. `@procedures/browser` uses it for the new option `hostPolicy` of each render. The change adds names and is backward compatible, so it is a patch.

- `startPolicyProxy({ policy, onRefusal })` starts the proxy on `127.0.0.1`, on a free port. It gives `host`, `port`, `url`, `refusals` and `close()`.
- The proxy takes `CONNECT` tunnels and plain requests with an absolute `http:` URL. It examines each host with `checkHost`, and connects only to the checked addresses.
- A refused host gets the status 403. `refusals` keeps the first `MAX_PROXY_REFUSALS` refusals, and `onRefusal` gets each refusal.
- The options `hostPolicy` and `onHostRefusal` of each render start the proxy for the run, and stop it at the end, also after an error.
- `policyProxyArgs(proxyUrl)` gives the flags of the browser: the proxy, the bypass rule `<-loopback>`, no QUIC, no UDP for WebRTC and no DNS look-up.
- With `hostPolicy`, a flag of `args` that can undo these flags gives an error before the browser starts.
- `@procedures/browser` now depends on `@procedures/http`.
