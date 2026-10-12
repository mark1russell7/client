#!/usr/bin/env node
/**
 * General Procedure Server CLI
 *
 * Starts a server that exposes the procedures of some packages via HTTP/WebSocket. The server
 * has a registry of its own, built from the module of each package (roadmap 3.1), and the host
 * policy of the core (roadmap 2.3). `mark serve` starts the same server.
 *
 * Usage:
 *   procedure-server --procedures @mark1russell7/client-mongo --port 3000
 */

import { runServer } from "./run.js";

runServer(process.argv.slice(2)).catch((error) => {
  console.error("Server failed to start:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
