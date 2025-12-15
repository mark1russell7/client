/**
 * MongoDB connection management for client-mongo
 *
 * Supports:
 * - Environment variable configuration (MONGODB_URI, MONGODB_DATABASE)
 * - Programmatic configuration
 * - Singleton pattern for default connection
 * - Multiple connections for multi-tenant scenarios
 */
import { MongoClient, Db } from "mongodb";
// Default connection singleton
let defaultConnection = null;
/**
 * Set the default connection used by procedures
 */
export function setDefaultConnection(conn) {
    defaultConnection = conn;
}
/**
 * Get the default connection
 * @throws Error if no connection has been established
 */
export function getDefaultConnection() {
    if (!defaultConnection) {
        throw new Error("MongoDB connection not initialized. Call connect() first.");
    }
    return defaultConnection;
}
/**
 * Check if a default connection exists
 */
export function hasDefaultConnection() {
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
export async function connect(options = {}) {
    const uri = options.uri ?? process.env["MONGODB_URI"] ?? "mongodb://localhost:27017";
    const database = options.database ?? process.env["MONGODB_DATABASE"] ?? "test";
    const client = new MongoClient(uri, options.clientOptions);
    await client.connect();
    let connected = true;
    const connection = {
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
export async function disconnect() {
    if (defaultConnection) {
        await defaultConnection.disconnect();
        defaultConnection = null;
    }
}
/**
 * Get the database from the default connection
 * Convenience function for procedure handlers
 */
export function getDb() {
    return getDefaultConnection().getDb();
}
/**
 * Get the MongoClient from the default connection
 * Convenience function for advanced operations
 */
export function getClient() {
    return getDefaultConnection().getClient();
}
//# sourceMappingURL=connection.js.map