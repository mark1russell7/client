/**
 * MongoDB Server Manager - Manages MongoDB peer servers
 */

import type { ServerInfo, PeerEndpoint } from "./types.js";

interface ManagedServer {
  peer: unknown; // Peer type from client-server
  endpoints: PeerEndpoint[];
  startedAt: Date;
  procedureCount: number;
}

class MongoServerManager {
  private servers = new Map<string, ManagedServer>();
  private counter = 0;

  register(peer: unknown, endpoints: PeerEndpoint[], procedureCount: number): string {
    const serverId = `mongo-server-${Date.now()}-${++this.counter}`;
    this.servers.set(serverId, {
      peer,
      endpoints,
      startedAt: new Date(),
      procedureCount,
    });
    return serverId;
  }

  get(serverId: string): ManagedServer | undefined {
    return this.servers.get(serverId);
  }

  async stop(serverId: string): Promise<boolean> {
    const server = this.servers.get(serverId);
    if (!server) return false;

    try {
      // Stop the peer
      const peer = server.peer as { stop?: () => Promise<void> };
      if (peer.stop) {
        await peer.stop();
      }
      this.servers.delete(serverId);
      return true;
    } catch {
      return false;
    }
  }

  getStatus(serverId?: string): ServerInfo[] {
    const result: ServerInfo[] = [];

    for (const [id, server] of this.servers) {
      if (serverId && id !== serverId) continue;

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

export const mongoServerManager: MongoServerManager = new MongoServerManager();
