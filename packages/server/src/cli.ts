#!/usr/bin/env node
/**
 * General Procedure Server CLI
 *
 * Starts a server that exposes registered procedures via HTTP/WebSocket.
 * Uses server.create procedure internally (dogfooding).
 *
 * Usage:
 *   server --procedures @mark1russell7/client-mongo/register --port 3000
 */

import type {
  LocalTransport,
  Method,
  Message,
  ProcedureContext,
  ProcedurePath,
  AnyProcedure,
  ProcedureRegistry,
} from "@mark1russell7/client";
import { parseConfig } from "./config.js";
import type { ServerCreateResult } from "./types.js";

/**
 * Convert procedure path to transport method
 */
function pathToMethod(path: string[]): Method {
  const [service, ...rest] = path;
  return { service: service!, operation: rest.join(".") };
}

/**
 * Register procedure handlers on the transport
 */
function syncRegistryToTransport(
  transport: LocalTransport,
  registry: ProcedureRegistry
): void {
  // Helper to execute a procedure by path (for ctx.client.call)
  async function execProcedure<TOutput>(
    path: ProcedurePath,
    input: unknown
  ): Promise<TOutput> {
    const proc = registry.get(path);
    if (!proc || !proc.handler) {
      throw new Error(`Procedure not found: ${path.join(".")}`);
    }
    const ctx = createContext(path);
    return proc.handler(input, ctx) as Promise<TOutput>;
  }

  // Helper to create ProcedureContext with client.call support
  function createContext(path: ProcedurePath): ProcedureContext {
    return {
      metadata: {},
      path,
      client: {
        call: <TInput, TOutput>(p: ProcedurePath, i: TInput) =>
          execProcedure<TOutput>(p, i),
      },
    };
  }

  for (const procedure of registry.getAll()) {
    if (procedure.handler) {
      const method = pathToMethod(procedure.path);
      transport.register(method, async (payload: unknown, message: Message<unknown>) => {
        const context: ProcedureContext = {
          ...createContext(procedure.path),
          metadata: message.metadata ?? {},
          ...(message.signal ? { signal: message.signal } : {}),
        };
        return procedure.handler!(payload, context);
      });
    }
  }

  registry.on("register", (procedure: AnyProcedure) => {
    if (procedure.handler) {
      const method = pathToMethod(procedure.path);
      transport.register(method, async (payload: unknown, message: Message<unknown>) => {
        const context: ProcedureContext = {
          ...createContext(procedure.path),
          metadata: message.metadata ?? {},
          ...(message.signal ? { signal: message.signal } : {}),
        };
        return procedure.handler!(payload, context);
      });
    }
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2));

  console.log("Starting procedure server...");

  if (config.verbose) {
    console.log("  Procedures:", config.procedures.join(", ") || "(none specified)");
    console.log("  Transports:", config.transports.map((t) => t.type).join(", "));
  }

  // Dynamic imports for ESM packages
  const clientModule = await import("@mark1russell7/client");
  const { Client, LocalTransport, PROCEDURE_REGISTRY } = clientModule;

  // Import client-server to register server.create procedure
  const clientServer = await import("@mark1russell7/client-server");
  clientServer.registerServerProcedures();

  // Dynamically import procedure packages
  for (const pkg of config.procedures) {
    if (config.verbose) {
      console.log(`  Loading: ${pkg}`);
    }
    try {
      await import(pkg);
    } catch (error) {
      console.error(`Failed to load procedure package: ${pkg}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // Create local transport and sync registry
  const transport = new LocalTransport();
  syncRegistryToTransport(transport, PROCEDURE_REGISTRY);
  const client = new Client({ transport });

  // Get procedure count before starting
  const procedureCount = PROCEDURE_REGISTRY.getAll().length;

  if (config.verbose) {
    console.log(`  Registered procedures: ${procedureCount}`);
  }

  // DOGFOOD: Use server.create procedure to start the server
  const result = await client.call<
    { transports: typeof config.transports; autoRegister: boolean },
    ServerCreateResult
  >(
    { service: "server", operation: "create" },
    {
      transports: config.transports,
      autoRegister: true,
    }
  );

  console.log("\nServer started!");
  console.log(`  Server ID: ${result.serverId}`);
  console.log(`  Procedures: ${result.procedureCount}`);
  console.log("\nEndpoints:");
  for (const endpoint of result.endpoints) {
    console.log(`  [${endpoint.type}] ${endpoint.address}`);
  }
  console.log("\nPress Ctrl+C to stop the server.");

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {
    // Never resolves - keeps process running
  });
}

main().catch((error) => {
  console.error("Server failed to start:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
