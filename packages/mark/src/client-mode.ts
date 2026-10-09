/**
 * CLI Client Mode
 *
 * Connects to a running CLI server and executes commands remotely.
 * Falls back to local execution if no server is available.
 */

import { currentBuild, findServer } from "./lockfile.js";

interface ClientModeResult {
  success: boolean;
  result?: unknown;
  error?: string;
  /** The onItem callback printed each item already */
  printed?: boolean;
}

/**
 * Try to execute command via running server. The input is the procedure input that the CLI
 * parsed and validated already.
 * Returns null if no server available (should fall back to local)
 */
export async function tryClientMode(
  path: string[],
  input: unknown,
  onItem?: (item: unknown) => void
): Promise<ClientModeResult | null> {
  // A running server of this build, started in this folder, that answers as the peer of its
  // lockfile and has a token. Otherwise the CLI runs the command itself. (Before, any server
  // with a live PID was used: relative paths resolved in the server's folder, an old build ran
  // after a rebuild, and a reused PID broke every command: deep dive CLI-3, CLI-4, CLI-14.)
  // server.* manages the servers themselves: it always runs here. (Through the server,
  // `mark server stop` ran server.stop inside the server it stopped: no answer, no cleanup.)
  if (path[0] === "server") {
    return null;
  }
  const lockfile = await findServer({ cwd: process.cwd(), build: currentBuild() });
  // mark sends its commands over HTTP: a WebSocket-only server cannot take them
  if (!lockfile?.token || lockfile.transport === "websocket") {
    return null;
  }

  let client: InstanceType<typeof import("@mark1russell7/client").Client>;
  let method: { service: string; operation: string };
  try {
    // Dynamic import client
    const clientModule = await import("@mark1russell7/client");
    const { Client, HttpTransport } = clientModule;

    // Connect to server
    const transport = new HttpTransport({
      baseUrl: lockfile.endpoint,
      defaultHeaders: { Authorization: `Bearer ${lockfile.token}` },
    });
    client = new Client({ transport });

    // The method of the path as ProcedureServer registers it: the last segment is the operation.
    // (Before, the first segment was the service, so a path of three segments - docker compose up -
    // was not found on the server.)
    method = { service: path.slice(0, -1).join("."), operation: path[path.length - 1]! };
  } catch {
    // Nothing was sent to the server yet - fall back to local execution
    return null;
  }

  // Execute remotely. From here on, do not fall back to local execution: the server may
  // have run (part of) the command, and running it again would repeat its side effects.
  try {
    // Each item of the response as it arrives (a streaming procedure gives many). The result
    // is the last item.
    let last: { value: unknown } | undefined;
    for await (const item of client.stream(method, input)) {
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
}
