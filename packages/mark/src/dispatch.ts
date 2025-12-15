/**
 * Generic Dispatcher
 *
 * Dispatches CLI commands to client procedures.
 * This is the core of the declarative CLI system.
 */

import { Client, LocalTransport } from "client";
import type { CommandSpec, ParsedArgs } from "./types.js";

// Import client-cli to register its procedures
import "@mark1russell7/client-cli";

// Import client-logger for logging
import "@mark1russell7/client-logger";

/**
 * Create a client instance with local transport
 */
function createClient(): Client {
  return new Client({
    transport: new LocalTransport(),
  });
}

// Singleton client instance
let clientInstance: Client | null = null;

/**
 * Get the client instance (lazy initialization)
 */
function getClient(): Client {
  if (!clientInstance) {
    clientInstance = createClient();
  }
  return clientInstance;
}

/**
 * Dispatch a CLI command to its corresponding procedure
 *
 * @param spec - The command specification
 * @param parsed - The parsed CLI arguments
 * @returns The procedure result
 */
export async function dispatch(
  spec: CommandSpec,
  parsed: ParsedArgs
): Promise<unknown> {
  const client = getClient();

  // Transform args to payload
  const payload = spec.transform
    ? spec.transform(parsed)
    : { ...parsed.args, ...parsed.options };

  // Validate if schema provided
  if (spec.inputSchema) {
    spec.inputSchema.parse(payload);
  }

  // Build the method from procedure path
  const [service, ...rest] = spec.procedure;
  const operation = rest.join(".");

  // Call the procedure
  const result = await client.call<unknown, unknown>(
    { service: service!, operation },
    payload
  );

  return result;
}

/**
 * Format the result for CLI output
 */
export function formatResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  return JSON.stringify(result, null, 2);
}
