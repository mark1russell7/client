/**
 * Stdio Transport Wrapper
 *
 * Creates an MCP stdio transport for CLI usage.
 */

import type { Readable, Writable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Create a stdio transport for MCP server.
 *
 * Stdio transport uses standard input/output for communication,
 * suitable for CLI tools and desktop app integrations. A test or an embedding gives other
 * streams: the defaults are `process.stdin` and `process.stdout`.
 *
 * @returns MCP stdio transport instance
 */
export function createStdioTransport(stdin?: Readable, stdout?: Writable): StdioServerTransport {
  return new StdioServerTransport(stdin, stdout);
}
