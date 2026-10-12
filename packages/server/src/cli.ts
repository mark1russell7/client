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

import { randomBytes } from "node:crypto";
import { parseConfig } from "./config.js";
import type { ServerCreateResult } from "./types.js";

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

  // Importing client-server registers server.create. (A second registerServerProcedures() call
  // threw "already registered", so the server never started: deep dive CLI-6.)
  await import("@mark1russell7/client-server");

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
  // The transport runs each procedure of the registry through invokeProcedure() (ARCHITECTURE-PROPOSALS P1)
  const transport = new LocalTransport({ registry: PROCEDURE_REGISTRY });
  const client = new Client({ transport });

  // Get procedure count before starting
  const procedureCount = PROCEDURE_REGISTRY.getAll().length;

  if (config.verbose) {
    console.log(`  Registered procedures: ${procedureCount}`);
  }

  // A token by default: the server serves every procedure it loads, and any local program
  // could call it. `--no-token` turns this off on purpose.
  const envToken = process.env["SERVER_TOKEN"] || undefined;
  const generated = config.token === undefined && envToken === undefined;
  const token = config.token === null ? undefined : (config.token ?? envToken ?? randomBytes(24).toString("hex"));

  // DOGFOOD: Use server.create procedure to start the server
  const result = await client.call<
    { transports: typeof config.transports; autoRegister: boolean; token?: string; expose?: string[] },
    ServerCreateResult
  >(
    { service: "server", operation: "create" },
    {
      transports: config.transports,
      autoRegister: true,
      ...(token !== undefined ? { token } : {}),
      ...(config.expose.length > 0 ? { expose: config.expose } : {}),
    }
  );

  console.log("\nServer started!");
  console.log(`  Server ID: ${result.serverId}`);
  console.log(`  Procedures: ${result.procedureCount}`);
  console.log("\nEndpoints:");
  for (const endpoint of result.endpoints) {
    console.log(`  [${endpoint.type}] ${endpoint.address}`);
  }
  if (token === undefined) {
    console.log("\nNo token: any program on this computer can call the server.");
  } else {
    console.log(`\nToken${generated ? " (random, for this run)" : ""}: ${token}`);
    console.log("  Send it as 'Authorization: Bearer <token>', or as ?token=<token> for WebSocket.");
  }
  if (config.expose.length > 0) {
    console.log(`Serves only: ${config.expose.join(", ")}`);
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
