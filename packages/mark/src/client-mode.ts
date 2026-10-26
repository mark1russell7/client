/**
 * CLI Client Mode
 *
 * Connects to a running CLI server and executes commands remotely (the warm mode).
 * Without a server, the command runs in this process (the cold mode, `command.ts`).
 */

import { currentBuild, findServer, type LockfileData } from "./lockfile.js";

interface ClientModeResult {
  success: boolean;
  result?: unknown;
  error?: string;
  /** The onItem callback printed each item already */
  printed?: boolean;
}

/** A connection to the CLI server for one command. */
export interface CliServerConnection {
  /**
   * This method runs the command on the server. The input is the procedure input that the CLI
   * parsed and validated already. The signal stops the call: the server gets the abort (CLI-26).
   */
  call(input: unknown, onItem?: (item: unknown) => void, signal?: AbortSignal): Promise<ClientModeResult>;
}

/**
 * This function connects to the CLI server that a command of this run can use. It gives null when
 * no such server runs: then the command runs in this process.
 */
export async function connectCliServer(path: string[], fsRoot?: string): Promise<CliServerConnection | null> {
  // A running server of this build, started in this folder, that answers as the peer of its
  // lockfile and has a token. Otherwise the CLI runs the command itself. (Before, any server
  // with a live PID was used: relative paths resolved in the server's folder, an old build ran
  // after a rebuild, and a reused PID broke every command: deep dive CLI-3, CLI-4, CLI-14.)
  // server.* manages the servers themselves: it always runs here. (Through the server,
  // `mark server stop` ran server.stop inside the server it stopped: no answer, no cleanup.)
  if (path[0] === "server") {
    return null;
  }
  // The server must have the same fs root (--fs-root), or none when this run has none
  const lockfile = await findServer({ cwd: process.cwd(), build: currentBuild(), fsRoot });
  // mark sends its commands over HTTP: a WebSocket-only server cannot take them
  if (!lockfile?.token || lockfile.transport === "websocket") {
    return null;
  }
  return cliServerConnection({ endpoint: lockfile.endpoint, token: lockfile.token }, path);
}

/**
 * This function gives a connection to the CLI server of a lockfile for the command of a path: the
 * HTTP endpoint and the token. It gives null when the client cannot load: then nothing went to
 * the server, and the command runs in this process.
 */
export async function cliServerConnection(
  server: Pick<LockfileData, "endpoint"> & { readonly token: string },
  path: string[]
): Promise<CliServerConnection | null> {
  let client: InstanceType<typeof import("@procedures/client").Client>;
  let method: { service: string; operation: string };
  try {
    // Dynamic import client
    const clientModule = await import("@procedures/client");
    const { Client, HttpTransport, pathToMethod } = clientModule;

    // Connect to server
    const transport = new HttpTransport({
      baseUrl: server.endpoint,
      defaultHeaders: { Authorization: `Bearer ${server.token}` },
    });
    client = new Client({ transport });

    // The method of the path as ProcedureServer registers it: the last segment is the operation.
    // (Before, the first segment was the service, so a path of three segments - docker compose up -
    // was not found on the server.) The core mapping encodes a dot in a segment (roadmap CLI-75).
    method = pathToMethod(path);
  } catch {
    // Nothing was sent to the server yet - fall back to local execution
    return null;
  }

  return {
    async call(input, onItem, signal) {
      // Execute remotely. From here on, do not fall back to local execution: the server may
      // have run (part of) the command, and running it again would repeat its side effects.
      try {
        // Each item of the response as it arrives (a streaming procedure gives many). The result
        // is the last item. The signal aborts the request, and the server aborts the call (before
        // CLI-26, the call had no signal: a Ctrl-C ended this process, and the server continued).
        let last: { value: unknown } | undefined;
        for await (const item of client.stream(method, input, signal ? { signal } : undefined)) {
          last = { value: item };
          onItem?.(item);
        }
        if (!last) {
          throw new Error("No response received from the CLI server");
        }
        return {
          success: true,
          result: last.value,
          printed: onItem !== undefined,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Try to execute command via running server. The input is the procedure input that the CLI
 * parsed and validated already. The signal stops the call on the server.
 * Returns null if no server available (should fall back to local)
 */
export async function tryClientMode(
  path: string[],
  input: unknown,
  onItem?: (item: unknown) => void,
  fsRoot?: string,
  signal?: AbortSignal
): Promise<ClientModeResult | null> {
  const connection = await connectCliServer(path, fsRoot);
  return connection === null ? null : connection.call(input, onItem, signal);
}
