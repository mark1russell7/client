---
"@procedures/docker": minor
---

More docker procedures (roadmap R41): `docker.compose.ps`, `docker.compose.logs`, `docker.compose.build`, `docker.compose.restart`, `docker.images`, `docker.inspect` (with `data`, the parsed JSON), `docker.volume.list`, `docker.volume.create`, `docker.volume.remove`, `docker.network.list`, `docker.network.create`, `docker.network.remove`, `docker.tag`, `docker.push` and `docker.prune`. Each one declares its effects and `calls: ["shell.run"]`. `docker.prune` is destructive and needs `confirm: true`.

`docker.run` and `docker.exec` take `args`, the command as a list of arguments. R32 found that `command`, split at whitespace, cannot carry an argument with a space or quotes. `command` still works. The two together are an error, and `docker.exec` needs one of them.

`docker.*` is a namespace of the MCP tools, so the dev-tools MCP server gets the new procedures as tools when `bundle-mcp` and the snapshots of `impl-mcp-dev` take them.
