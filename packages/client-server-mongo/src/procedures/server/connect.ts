/**
 * server.mongo.connect procedure - Connect to MongoDB
 */

import type { ServerMongoConnectInput, ServerMongoConnectOutput } from "../../types.js";

let connectFn: unknown;

async function ensureImports(): Promise<void> {
  if (!connectFn) {
    const clientMongo = await import("@mark1russell7/client-mongo");
    connectFn = clientMongo.connect;
  }
}

export async function serverMongoConnect(input: ServerMongoConnectInput): Promise<ServerMongoConnectOutput> {
  await ensureImports();

  const { uri, database } = input;

  const connect = connectFn as (opts?: { uri?: string | undefined; database?: string | undefined }) => Promise<{ database: string }>;
  const connectOpts: { uri?: string; database?: string } = {};
  if (uri) connectOpts.uri = uri;
  if (database) connectOpts.database = database;
  const result = await connect(connectOpts);

  return {
    success: true,
    database: result.database,
  };
}
