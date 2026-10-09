/**
 * Vite Server Manager - Manages running Vite servers
 *
 * The manager is a view of the process registry of client-shell, for the group "vite"
 * (deep dive WRP-4, WRP-10): `stop` ends the whole process tree (vite and esbuild), the registry
 * reads the output of each server, and the servers end when the host ends.
 */

import { processes } from "@mark1russell7/client-shell/command";
import { resolveViteCli } from "./vite-cli.js";

/** The group of the vite servers in the process registry. */
export const VITE_GROUP = "vite";

/** The line where vite prints the URL of a server that is ready. */
const READY = /Local:\s+(https?:\/\/\S+)/;

export interface StartedServer {
  serverId: string;
  url: string;
  pid: number;
}

class ServerManager {
  /**
   * Start `vite <args>` with the project's own vite and no shell, and wait for its URL.
   * When the server does not get ready, the manager stops it and throws.
   */
  async start(args: string[], cwd: string | undefined, timeout = 30000): Promise<StartedServer> {
    const root = cwd ?? process.cwd();
    const started = processes.start(process.execPath, {
      args: [resolveViteCli(root), ...args],
      cwd: root,
      // No colors: the output stays plain text for the readers of the registry
      env: { NO_COLOR: "1" },
      group: VITE_GROUP,
      label: `vite ${args.join(" ")}`.trim(),
    });
    try {
      const match = await processes.waitFor(started.id, READY, timeout);
      return { serverId: started.id, url: match[1]!, pid: started.pid };
    } catch (error) {
      await processes.stop(started.id);
      throw error;
    }
  }

  /** True when the server has a record and is running. */
  running(serverId: string): boolean {
    const info = processes.get(serverId);
    return info?.group === VITE_GROUP && info.status === "running";
  }

  /** Stop a server and the processes that it started, and wait for its end. */
  async stop(serverId: string): Promise<boolean> {
    if (!this.running(serverId)) return false;
    return (await processes.stop(serverId)).stopped;
  }
}

export const serverManager: ServerManager = new ServerManager();
