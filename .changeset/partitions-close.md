---
"@procedures/client": patch
"@procedures/peer": patch
"@procedures/mcp-server": patch
---

The storages of a partitioned collection close at the stop of the server.

- `CollectionPartitions` gets an optional `close()`. `closeStorages()` and `stop()` of `ProcedureServer` close each partitions object one time with it.
- `ProcedureServer.partitionHandles()` gives one dependency handle for each partitions object, with the name `partitions.<collections>`. The handle closes the partitions after the transports close.
- The procedures host and the MCP host declare these handles next to the storage handles. The new type `McpRunnerPartitions` of `@procedures/mcp-server` is the partitions handle, and `McpServiceBuilder.dependency` takes it next to `McpRunnerDependency`. `host.dependencies` of the procedures host also gives the storages and partitions that the app adds after the construction.
- Partitions without `close()` stay on the server, and the host closes their storages.
