/**
 * MongoDB Server Manager - Manages MongoDB peer servers
 */
class MongoServerManager {
    servers = new Map();
    counter = 0;
    register(peer, endpoints, procedureCount) {
        const serverId = `mongo-server-${Date.now()}-${++this.counter}`;
        this.servers.set(serverId, {
            peer,
            endpoints,
            startedAt: new Date(),
            procedureCount,
        });
        return serverId;
    }
    get(serverId) {
        return this.servers.get(serverId);
    }
    async stop(serverId) {
        const server = this.servers.get(serverId);
        if (!server)
            return false;
        try {
            // Stop the peer
            const peer = server.peer;
            if (peer.stop) {
                await peer.stop();
            }
            this.servers.delete(serverId);
            return true;
        }
        catch {
            return false;
        }
    }
    getStatus(serverId) {
        const result = [];
        for (const [id, server] of this.servers) {
            if (serverId && id !== serverId)
                continue;
            result.push({
                serverId: id,
                endpoints: server.endpoints,
                startedAt: server.startedAt.toISOString(),
                procedureCount: server.procedureCount,
            });
        }
        return result;
    }
}
export const mongoServerManager = new MongoServerManager();
//# sourceMappingURL=server-manager.js.map