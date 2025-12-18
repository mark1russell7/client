/**
 * Connection Manager - Internal state management
 *
 * Manages tracked connections and subscriptions.
 * This is used internally by the procedures.
 */
// =============================================================================
// Connection Manager
// =============================================================================
class ConnectionManagerImpl {
    connections = new Map();
    subscriptions = new Map();
    pendingRequests = new Map();
    subscriptionCounter = 0;
    // ---------------------------------------------------------------------------
    // Connection Management
    // ---------------------------------------------------------------------------
    /**
     * Register a new connection
     */
    addConnection(conn) {
        this.connections.set(conn.id, conn);
    }
    /**
     * Remove a connection
     */
    removeConnection(clientId) {
        this.connections.delete(clientId);
        // Clean up subscriptions for this client
        for (const [subId, sub] of this.subscriptions) {
            if (sub.clientId === clientId) {
                this.subscriptions.delete(subId);
            }
        }
    }
    /**
     * Get a specific connection
     */
    getConnection(clientId) {
        return this.connections.get(clientId);
    }
    /**
     * Get all connections
     */
    getAllConnections() {
        return Array.from(this.connections.values());
    }
    /**
     * Get connection info (public view)
     */
    getConnectionInfo(clientId) {
        const conn = this.connections.get(clientId);
        if (!conn)
            return null;
        return {
            id: conn.id,
            connectedAt: conn.connectedAt.toISOString(),
            metadata: conn.metadata,
            procedures: conn.procedures,
        };
    }
    /**
     * Get all connections as info (public view)
     */
    getAllConnectionInfo() {
        return this.getAllConnections().map((conn) => ({
            id: conn.id,
            connectedAt: conn.connectedAt.toISOString(),
            metadata: conn.metadata,
            procedures: conn.procedures,
        }));
    }
    // ---------------------------------------------------------------------------
    // RPC to Client
    // ---------------------------------------------------------------------------
    /**
     * Call a procedure on a specific client
     */
    async callClient(clientId, path, input, timeout = 30000) {
        const conn = this.connections.get(clientId);
        if (!conn) {
            throw new Error(`Connection not found: ${clientId}`);
        }
        const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout after ${timeout}ms`));
            }, timeout);
            this.pendingRequests.set(requestId, {
                id: requestId,
                resolve,
                reject,
                timeout: timeoutHandle,
            });
            // Send server-request message to client
            conn.send({
                type: "server-request",
                id: requestId,
                path,
                input,
            }).catch((err) => {
                this.pendingRequests.delete(requestId);
                clearTimeout(timeoutHandle);
                reject(err);
            });
        });
    }
    /**
     * Handle a response from a client
     */
    handleResponse(requestId, result, error) {
        const pending = this.pendingRequests.get(requestId);
        if (!pending)
            return;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
        if (error) {
            pending.reject(new Error(error));
        }
        else {
            pending.resolve(result);
        }
    }
    /**
     * Broadcast a procedure call to all clients
     */
    async broadcast(path, input, options = {}) {
        const connections = this.getAllConnections();
        const sent = connections.length;
        if (!options.waitForResponses) {
            // Fire and forget
            for (const conn of connections) {
                const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                conn.send({
                    type: "server-request",
                    id: requestId,
                    path,
                    input,
                }).catch(() => {
                    // Ignore send errors in fire-and-forget mode
                });
            }
            return { sent };
        }
        // Wait for responses
        const results = await Promise.all(connections.map(async (conn) => {
            try {
                const result = await this.callClient(conn.id, path, input, options.timeout);
                return { clientId: conn.id, result };
            }
            catch (err) {
                return { clientId: conn.id, error: String(err) };
            }
        }));
        return { sent, results };
    }
    // ---------------------------------------------------------------------------
    // Pub/Sub
    // ---------------------------------------------------------------------------
    /**
     * Subscribe a client to a topic
     */
    subscribe(clientId, topic) {
        const conn = this.connections.get(clientId);
        if (!conn) {
            throw new Error(`Connection not found: ${clientId}`);
        }
        const subscriptionId = `sub_${++this.subscriptionCounter}_${Date.now()}`;
        this.subscriptions.set(subscriptionId, {
            id: subscriptionId,
            topic,
            clientId,
            createdAt: new Date(),
        });
        return subscriptionId;
    }
    /**
     * Unsubscribe from a topic
     */
    unsubscribe(subscriptionId) {
        return this.subscriptions.delete(subscriptionId);
    }
    /**
     * Publish data to all subscribers of a topic
     */
    async publish(topic, data) {
        const subscribers = Array.from(this.subscriptions.values()).filter((sub) => sub.topic === topic);
        let delivered = 0;
        for (const sub of subscribers) {
            const conn = this.connections.get(sub.clientId);
            if (!conn)
                continue;
            try {
                await conn.send({
                    type: "event",
                    topic,
                    data,
                    subscriptionId: sub.id,
                });
                delivered++;
            }
            catch {
                // Ignore send errors
            }
        }
        return delivered;
    }
    /**
     * Get subscriptions for a topic
     */
    getSubscriptions(topic) {
        const subs = Array.from(this.subscriptions.values());
        if (topic) {
            return subs.filter((s) => s.topic === topic);
        }
        return subs;
    }
}
// =============================================================================
// Singleton Export
// =============================================================================
export const connectionManager = new ConnectionManagerImpl();
/**
 * Get the connection manager instance
 */
export function getConnectionManager() {
    return connectionManager;
}
//# sourceMappingURL=manager.js.map