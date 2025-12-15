/**
 * MongoDB connection management for client-mongo
 *
 * Supports:
 * - Environment variable configuration (MONGODB_URI, MONGODB_DATABASE)
 * - Programmatic configuration
 * - Singleton pattern for default connection
 * - Multiple connections for multi-tenant scenarios
 */

import { MongoClient, Db, type MongoClientOptions } from "mongodb";

/**
 * Options for creating a MongoDB connection
 */
export interface MongoConnectionOptions {
  /** MongoDB connection URI (default: MONGODB_URI env var or mongodb://localhost:27017) */
  uri?: string;
  /** Database name (default: MONGODB_DATABASE env var or "test") */
  database?: string;
  /** Additional MongoDB client options */
  clientOptions?: MongoClientOptions;
}

/**
 * MongoDB connection interface
 */
export interface MongoConnection {
  /** Get the database instance */
  getDb(): Db;
  /** Get the underlying MongoClient */
  getClient(): MongoClient;
  /** Connect to the database (no-op if already connected) */
  connect(): Promise<void>;
  /** Disconnect from the database */
  disconnect(): Promise<void>;
  /** Check if connected */
  isConnected(): boolean;
}

// Default connection singleton
let defaultConnection: MongoConnection | null = null;

/**
 * Set the default connection used by procedures
 */
export function setDefaultConnection(conn: MongoConnection): void {
  defaultConnection = conn;
}

/**
 * Get the default connection
 * @throws Error if no connection has been established
 */
export function getDefaultConnection(): MongoConnection {
  if (!defaultConnection) {
    throw new Error(
      "MongoDB connection not initialized. Call connect() first."
    );
  }
  return defaultConnection;
}

/**
 * Check if a default connection exists
 */
export function hasDefaultConnection(): boolean {
  return defaultConnection !== null;
}

/**
 * Create and connect to MongoDB
 *
 * @example
 * ```typescript
 * // Using environment variables
 * await connect();
 *
 * // With explicit options
 * await connect({
 *   uri: "mongodb://localhost:27017",
 *   database: "myapp"
 * });
 * ```
 */
export async function connect(
  options: MongoConnectionOptions = {}
): Promise<MongoConnection> {
  const uri =
    options.uri ?? process.env["MONGODB_URI"] ?? "mongodb://localhost:27017";
  const database =
    options.database ?? process.env["MONGODB_DATABASE"] ?? "test";

  const client = new MongoClient(uri, options.clientOptions);
  await client.connect();

  let connected = true;

  const connection: MongoConnection = {
    getDb: () => {
      if (!connected) {
        throw new Error("Connection has been closed");
      }
      return client.db(database);
    },
    getClient: () => {
      if (!connected) {
        throw new Error("Connection has been closed");
      }
      return client;
    },
    connect: async () => {
      // Already connected
    },
    disconnect: async () => {
      if (connected) {
        await client.close();
        connected = false;
      }
    },
    isConnected: () => connected,
  };

  setDefaultConnection(connection);
  return connection;
}

/**
 * Disconnect the default connection
 */
export async function disconnect(): Promise<void> {
  if (defaultConnection) {
    await defaultConnection.disconnect();
    defaultConnection = null;
  }
}

/**
 * Get the database from the default connection
 * Convenience function for procedure handlers
 */
export function getDb(): Db {
  return getDefaultConnection().getDb();
}

/**
 * Get the MongoClient from the default connection
 * Convenience function for advanced operations
 */
export function getClient(): MongoClient {
  return getDefaultConnection().getClient();
}
