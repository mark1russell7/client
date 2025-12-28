#!/usr/bin/env node
/**
 * MongoDB Server Entry Point
 *
 * Starts a MongoDB peer server exposing mongo procedures via HTTP.
 *
 * Environment Variables:
 *   PORT - Port to listen on (default: 3000)
 *   HOST - Host to bind to (default: 0.0.0.0)
 *   MONGODB_URI - MongoDB connection string (default: mongodb://localhost:27017)
 *   MONGODB_DATABASE - Database name (default: test)
 *
 * @example
 * ```bash
 * # Start with defaults
 * npx server-mongo
 *
 * # Start with custom config
 * PORT=8080 MONGODB_URI="mongodb://myhost:27017" npx server-mongo
 * ```
 */

import { config } from "./config.js";
import { serverMongoStart } from "@mark1russell7/client-server-mongo";

async function main(): Promise<void> {
  console.log(`Starting MongoDB server...`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Host: ${config.host}`);
  console.log(`  MongoDB URI: ${config.mongoUri}`);
  console.log(`  Database: ${config.database}`);

  try {
    const result = await serverMongoStart({
      port: config.port,
      host: config.host,
      mongoUri: config.mongoUri,
      database: config.database,
    });

    console.log(`\nServer started successfully!`);
    console.log(`  Server ID: ${result.serverId}`);
    console.log(`  Procedures: ${result.procedureCount}`);
    console.log(`\nEndpoints:`);
    for (const endpoint of result.endpoints) {
      console.log(`  - [${endpoint.type}] ${endpoint.address}`);
    }

    console.log(`\nPress Ctrl+C to stop the server.`);

    // Keep the process running
    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\nShutting down...");
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
