---
"@procedures/client": minor
"@procedures/server": minor
"@procedures/mark": minor
"@procedures/lib": minor
"@procedures/mcp-server": minor
---

**Breaking change:** each listener examines the `Host` header. By default, only `localhost`, `127.0.0.1`, `[::1]` and IP addresses pass. Give each other name with `--allowed-host` or `allowedHosts`.

The browser checks examine the `Host` header on each listener. Before, they examined it only on a loopback address. A server on a LAN address (`0.0.0.0`) accepted each host name.

A request must name one of these hosts in its `Host` header:

- A loopback name: `localhost`, `127.0.0.1` or `[::1]`.
- An IP address, for example `192.168.1.20` or `[fe80::1]`.
- A name of `browser.allowedHosts` of the host policy, with any letter case.

A request with another name gets `FORBIDDEN` (403) with the reason `host-header-not-allowed`. A request without a `Host` header gets it too. The message of the refusal names `allowedHosts` and `--allowed-host`. `browser.allowedHosts: "*"` turns the check off.

The server command and `mark --server` get the option `--allowed-host <names>`. Repeat the option, or separate the names with commas. `@procedures/server` exports `parseAllowedHosts`.

Migration steps:

- A server that a LAN, a proxy or a container network reaches by a name: give the name in `browser.allowedHosts` of `hostPolicy()`. Or start the server with `--allowed-host <name>`.
- An MCP face on HTTP that clients reach by a name: give the name in `http.allowedHosts` of the face, or in `browser.allowedHosts` of the policy.
- A server that clients reach by `localhost` or by an IP address: no change.
