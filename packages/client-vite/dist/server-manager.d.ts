/**
 * Vite Server Manager - Manages running Vite servers
 */
import { ChildProcess } from "child_process";
interface ManagedServer {
    process: ChildProcess;
    url: string;
    startedAt: Date;
}
declare class ServerManager {
    private servers;
    private counter;
    register(process: ChildProcess, url: string): string;
    get(serverId: string): ManagedServer | undefined;
    stop(serverId: string): boolean;
    waitForReady(serverId: string, timeout?: number): Promise<string>;
}
export declare const serverManager: ServerManager;
export {};
//# sourceMappingURL=server-manager.d.ts.map