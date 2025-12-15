/**
 * Generic Dispatcher
 *
 * Dispatches CLI commands to client procedures.
 * This is the core of the declarative CLI system.
 */

import {
  Client,
  LocalTransport,
  PROCEDURE_REGISTRY,
} from "@mark1russell7/client";
import type {
  Method,
  Message,
  ProcedurePath,
  ProcedureContext,
  AnyProcedure,
} from "@mark1russell7/client";
import type { CommandSpec, ParsedArgs } from "./types.js";

// Import client-cli to register its procedures
import "@mark1russell7/client-cli";

// Import client-logger for logging
import "@mark1russell7/client-logger";

/**
 * Convert a procedure path to a transport method
 */
function pathToMethod(path: ProcedurePath): Method {
  const [service, ...rest] = path;
  return {
    service: service!,
    operation: rest.join("."),
  };
}

/**
 * Sync procedures from PROCEDURE_REGISTRY to LocalTransport
 */
function syncRegistryToTransport(transport: LocalTransport): void {
  for (const procedure of PROCEDURE_REGISTRY.getAll()) {
    if (procedure.handler) {
      registerProcedureHandler(transport, procedure);
    }
  }

  // Listen for new registrations
  PROCEDURE_REGISTRY.on("register", (procedure: AnyProcedure) => {
    if (procedure.handler) {
      registerProcedureHandler(transport, procedure);
    }
  });

  // Listen for unregistrations
  PROCEDURE_REGISTRY.on("unregister", (procedure: AnyProcedure) => {
    transport.unregister(pathToMethod(procedure.path));
  });
}

/**
 * Register a procedure handler on LocalTransport
 */
function registerProcedureHandler(
  transport: LocalTransport,
  procedure: AnyProcedure
): void {
  const method = pathToMethod(procedure.path);

  // Wrap procedure handler to adapt signature
  transport.register(method, async (payload: unknown, message: Message<unknown>) => {
    // Create minimal procedure context from message
    // Use conditional property to satisfy exactOptionalPropertyTypes
    const context: ProcedureContext = {
      metadata: message.metadata ?? {},
      path: procedure.path,
      ...(message.signal ? { signal: message.signal } : {}),
    };

    // Call the procedure handler
    return procedure.handler!(payload, context);
  });
}

/**
 * Create a client instance with local transport
 */
function createClient(): Client {
  const transport = new LocalTransport();
  syncRegistryToTransport(transport);
  return new Client({ transport });
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
