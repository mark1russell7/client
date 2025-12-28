/**
 * server.mongo.start procedure - Start MongoDB peer server
 *
 * Uses server.create procedure internally (dogfooding) to create the peer.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { ServerMongoStartInput, ServerMongoStartOutput, TransportConfig } from "../../types.js";

interface ServerCreateOutput {
  serverId: string;
  endpoints: Array<{ type: string; address: string }>;
  procedureCount: number;
}

/**
 * Start a MongoDB peer server
 *
 * This procedure:
 * 1. Registers mongo procedures
 * 2. Connects to MongoDB (if URI provided)
 * 3. Calls server.create procedure (dogfooding) to create the peer
 */
export async function serverMongoStart(
  input: ServerMongoStartInput,
  ctx: ProcedureContext
): Promise<ServerMongoStartOutput> {
  const { port = 3000, host = "0.0.0.0", mongoUri, database, transports } = input;

  // Import and register mongo procedures
  const { registerMongoProcedures } = await import("@mark1russell7/client-mongo");
  registerMongoProcedures();

  // Connect to MongoDB if URI provided
  if (mongoUri || database) {
    const { connect } = await import("@mark1russell7/client-mongo");
    const connectOpts: { uri?: string; database?: string } = {};
    if (mongoUri) connectOpts.uri = mongoUri;
    if (database) connectOpts.database = database;
    await connect(connectOpts);
  }

  // Build transport configuration
  const transportConfig: TransportConfig[] = transports ?? [
    {
      type: "http",
      port,
      host,
      basePath: "/api",
      cors: true,
    },
  ];

  // DOGFOOD: Use server.create procedure to create the peer
  const result = await ctx.client.call<
    { transports: TransportConfig[]; autoRegister: boolean },
    ServerCreateOutput
  >(
    ["server", "create"],
    {
      transports: transportConfig,
      autoRegister: true,
    }
  );

  return {
    serverId: result.serverId,
    endpoints: result.endpoints,
    procedureCount: result.procedureCount,
  };
}
