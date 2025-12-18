/**
 * Connection Manager - Internal state management
 *
 * Manages tracked connections and subscriptions.
 * This is used internally by the procedures.
 */
import type { ConnectionInfo } from "./types.js";
export interface TrackedConnection {
    id: string;
    connectedAt: Date;
    metadata: Record<string, unknown>;
    procedures?: string[];
    /** Method to send a message to this connection */
    send: (message: unknown) => Promise<void>;
}
export interface Subscription {
    id: string;
    topic: string;
    clientId: string;
    createdAt: Date;
}
export interface PendingRequest {
    id: string;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
}
declare class ConnectionManagerImpl {
    private connections;
    private subscriptions;
    private pendingRequests;
    private subscriptionCounter;
    /**
     * Register a new connection
     */
    addConnection(conn: TrackedConnection): void;
    /**
     * Remove a connection
     */
    removeConnection(clientId: string): void;
    /**
     * Get a specific connection
     */
    getConnection(clientId: string): TrackedConnection | undefined;
    /**
     * Get all connections
     */
    getAllConnections(): TrackedConnection[];
    /**
     * Get connection info (public view)
     */
    getConnectionInfo(clientId: string): ConnectionInfo | null;
    /**
     * Get all connections as info (public view)
     */
    getAllConnectionInfo(): ConnectionInfo[];
    /**
     * Call a procedure on a specific client
     */
    callClient(clientId: string, path: string[], input: unknown, timeout?: number): Promise<unknown>;
    /**
     * Handle a response from a client
     */
    handleResponse(requestId: string, result: unknown, error?: string): void;
    /**
     * Broadcast a procedure call to all clients
     */
    broadcast(path: string[], input: unknown, options?: {
        waitForResponses?: boolean;
        timeout?: number;
    }): Promise<{
        sent: number;
        results?: Array<{
            clientId: string;
            result?: unknown;
            error?: string;
        }>;
    }>;
    /**
     * Subscribe a client to a topic
     */
    subscribe(clientId: string, topic: string): string;
    /**
     * Unsubscribe from a topic
     */
    unsubscribe(subscriptionId: string): boolean;
    /**
     * Publish data to all subscribers of a topic
     */
    publish(topic: string, data: unknown): Promise<number>;
    /**
     * Get subscriptions for a topic
     */
    getSubscriptions(topic?: string): Subscription[];
}
export declare const connectionManager: ConnectionManagerImpl;
/**
 * Get the connection manager instance
 */
export declare function getConnectionManager(): ConnectionManagerImpl;
export {};
//# sourceMappingURL=manager.d.ts.map