/**
 * server.mongo.start procedure - Start MongoDB peer server
 */

import type { ServerMongoStartInput, ServerMongoStartOutput, PeerEndpoint } from "../../types.js";
import { mongoServerManager } from "../../server-manager.js";

// Dynamic imports to avoid circular dependencies
let createPeerFn: unknown;
let connectFn: unknown;

async function ensureImports(): Promise<void> {
  if (!createPeerFn) {
    const clientServer = await import("@mark1russell7/client-server");
    createPeerFn = clientServer.createPeer;
  }
  if (!connectFn) {
    const clientMongo = await import("@mark1russell7/client-mongo");
    connectFn = clientMongo.connect;
  }
}

export async function serverMongoStart(input: ServerMongoStartInput): Promise<ServerMongoStartOutput> {
  await ensureImports();

  const { port = 3000, host = "0.0.0.0", mongoUri, database } = input;

  // Import and register mongo procedures
  const { registerMongoProcedures } = await import("@mark1russell7/client-mongo");
  registerMongoProcedures();

  // Connect to MongoDB if URI provided
  if (mongoUri || database) {
    const connect = connectFn as (opts?: { uri?: string | undefined; database?: string | undefined }) => Promise<void>;
    const connectOpts: { uri?: string; database?: string } = {};
    if (mongoUri) connectOpts.uri = mongoUri;
    if (database) connectOpts.database = database;
    await connect(connectOpts);
  }

  // Create peer with HTTP transport
  const createPeer = createPeerFn as (opts: {
    id?: string;
    transports: Array<{ type: string; port: number; host?: string; basePath?: string; cors?: boolean }>;
    autoRegister?: boolean;
  }) => Promise<{
    id: string;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    getEndpoints: () => PeerEndpoint[];
    getServer: () => { getProcedureCount: () => number };
  }>;

  const peer = await createPeer({
    id: `mongo-peer-${Date.now()}`,
    transports: [
      {
        type: "http",
        port,
        host,
        basePath: "/api",
        cors: true,
      },
    ],
    autoRegister: true,
  });

  await peer.start();

  const endpoints = peer.getEndpoints();
  const procedureCount = peer.getServer().getProcedureCount();

  const serverId = mongoServerManager.register(peer, endpoints, procedureCount);

  return {
    serverId,
    endpoints,
    procedureCount,
  };
}
