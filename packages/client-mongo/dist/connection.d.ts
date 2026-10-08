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
/**
 * Set the default connection used by procedures
 */
export declare function setDefaultConnection(conn: MongoConnection): void;
/**
 * Get the default connection
 * @throws Error if no connection has been established
 */
export declare function getDefaultConnection(): MongoConnection;
/**
 * Check if a default connection exists
 */
export declare function hasDefaultConnection(): boolean;
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
export declare function connect(options?: MongoConnectionOptions): Promise<MongoConnection>;
/**
 * Disconnect the default connection
 */
export declare function disconnect(): Promise<void>;
/**
 * Get the database from the default connection
 * Convenience function for procedure handlers
 */
export declare function getDb(): Db;
/**
 * Get the MongoClient from the default connection
 * Convenience function for advanced operations
 */
export declare function getClient(): MongoClient;
//# sourceMappingURL=connection.d.ts.map