/**
 * Vite Server Manager - Manages running Vite servers
 */

import { ChildProcess } from "child_process";

interface ManagedServer {
  process: ChildProcess;
  url: string;
  startedAt: Date;
}

class ServerManager {
  private servers = new Map<string, ManagedServer>();
  private counter = 0;

  register(process: ChildProcess, url: string): string {
    const serverId = `vite-${Date.now()}-${++this.counter}`;
    this.servers.set(serverId, { process, url, startedAt: new Date() });

    process.on("exit", () => {
      this.servers.delete(serverId);
    });

    return serverId;
  }

  get(serverId: string): ManagedServer | undefined {
    return this.servers.get(serverId);
  }

  stop(serverId: string): boolean {
    const server = this.servers.get(serverId);
    if (!server) return false;

    const killed = server.process.kill("SIGTERM");
    if (killed) {
      this.servers.delete(serverId);
    }
    return killed;
  }

  async waitForReady(serverId: string, timeout = 30000): Promise<string> {
    const server = this.servers.get(serverId);
    if (!server) throw new Error(`Server ${serverId} not found`);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Timeout waiting for server to start"));
      }, timeout);

      const onData = (data: Buffer) => {
        const output = data.toString();
        // Look for Vite's ready message with URL
        const match = output.match(/Local:\s+(https?:\/\/[^\s]+)/);
        if (match && match[1]) {
          clearTimeout(timeoutId);
          server.process.stdout?.off("data", onData);
          const url = match[1];
          server.url = url;
          resolve(url);
        }
      };

      server.process.stdout?.on("data", onData);
      server.process.stderr?.on("data", onData);

      server.process.on("exit", (code) => {
        clearTimeout(timeoutId);
        reject(new Error(`Server exited with code ${code}`));
      });
    });
  }
}

export const serverManager: ServerManager = new ServerManager();
