/**
 * MongoDB Server Manager - Manages MongoDB peer servers
 */
import type { ServerInfo, PeerEndpoint } from "./types.js";
interface ManagedServer {
    peer: unknown;
    endpoints: PeerEndpoint[];
    startedAt: Date;
    procedureCount: number;
}
declare class MongoServerManager {
    private servers;
    private counter;
    register(peer: unknown, endpoints: PeerEndpoint[], procedureCount: number): string;
    get(serverId: string): ManagedServer | undefined;
    stop(serverId: string): Promise<boolean>;
    getStatus(serverId?: string): ServerInfo[];
}
export declare const mongoServerManager: MongoServerManager;
export {};
//# sourceMappingURL=server-manager.d.ts.map