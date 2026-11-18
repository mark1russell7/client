---
"@procedures/mcp-dev-tools": patch
"@procedures/client": patch
"@procedures/mark": patch
---

The dev-tools MCP server forwards the tools of running peers (`MCP_PEERS`, `mark mcp --peers`).

- An entry `name=source` names a peer. A source is the base URL of the procedures of the peer, or its discovery file: a JSON object with `url` or `endpoint`, and `token`.
- At the start, the server reads the manifest of each peer with `peerModule`, with a time limit of 5 seconds. Each procedure of the peer becomes a tool, and its calls go to the peer.
- The server reads a discovery file at each call. Thus the calls follow a peer that starts again with a new port and token.
- A peer that does not answer gives no tools until the next start. The server writes the reason to stderr, and `DevToolsHost.peers` gives the state of each peer.
- The new exports of `@procedures/mcp-dev-tools` are `parsePeers`, `loadPeers`, `peerAddress`, `readDiscovery`, `DEFAULT_PEER_TIMEOUT_MS` and their types.
- `peerModule` of `@procedures/client` has the new option `signal` for the read of the manifest.
