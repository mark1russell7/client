#!/usr/bin/env node
/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures.
 * The CLI itself has no command-specific logic - it just:
 * 1. Imports client packages to register their procedures
 * 2. Reflects all procedures as Gluegun commands
 * 3. Runs Gluegun
 */

import { build } from "gluegun";
import {
  Client,
  LocalTransport,
  PROCEDURE_REGISTRY,
} from "@mark1russell7/client";
import type {
  Method,
  Message,
  ProcedureContext,
  AnyProcedure,
} from "@mark1russell7/client";
import { reflectAllProcedures } from "./reflect.js";

// Import client packages to register their procedures
import "@mark1russell7/client-cli";
import "@mark1russell7/client-logger";

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
function syncRegistryToTransport(transport: LocalTransport): void {
  for (const procedure of PROCEDURE_REGISTRY.getAll()) {
    if (procedure.handler) {
      const method = pathToMethod(procedure.path);
      transport.register(method, async (payload: unknown, message: Message<unknown>) => {
        const context: ProcedureContext = {
          metadata: message.metadata ?? {},
          path: procedure.path,
          ...(message.signal ? { signal: message.signal } : {}),
        };
        return procedure.handler!(payload, context);
      });
    }
  }

  // Listen for new registrations
  PROCEDURE_REGISTRY.on("register", (procedure: AnyProcedure) => {
    if (procedure.handler) {
      const method = pathToMethod(procedure.path);
      transport.register(method, async (payload: unknown, message: Message<unknown>) => {
        const context: ProcedureContext = {
          metadata: message.metadata ?? {},
          path: procedure.path,
          ...(message.signal ? { signal: message.signal } : {}),
        };
        return procedure.handler!(payload, context);
      });
    }
  });
}

/**
 * Create a client with local transport
 */
function createClient(): Client {
  const transport = new LocalTransport();
  syncRegistryToTransport(transport);
  return new Client({ transport });
}

/**
 * Run the CLI
 */
async function run(argv: string[]): Promise<void> {
  // Create client
  const client = createClient();

  // Build Gluegun CLI
  const cli = build()
    .brand("mark")
    .help()
    .version()
    .create();

  // Reflect all registered procedures as commands
  const procedures = PROCEDURE_REGISTRY.getAll();
  const commands = reflectAllProcedures(procedures, client);

  for (const cmd of commands) {
    cli.addCommand(cmd);
  }

  // Run
  await cli.run(argv);
}

// Entry point
run(process.argv.slice(2));

export { run };
