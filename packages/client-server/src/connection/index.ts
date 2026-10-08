/**
 * Connection Module
 *
 * Manages outbound connections to remote peers.
 * Uses Client + Transport for bidirectional RPC.
 */

import {
  Client,
  HttpTransport,
  WebSocketTransport,
  defaultUrlPattern,
  postOnlyStrategy,
  type HttpTransportOptions,
} from "@mark1russell7/client";
import type {
  TransportType,
  PeerConnection,
  ProcedureInfo,
  ProcedureAnnounceMessage,
} from "../types.js";

// =============================================================================
// Types
// =============================================================================

export interface ConnectOptions {
  /** Remote address (URL) */
  address: string;
  /** Transport type (auto-detected from URL if not specified) */
  transport?: TransportType;
  /** Connection timeout in ms */
  timeout?: number;
  /** Local peer ID to identify ourselves */
  localPeerId?: string;
}

export interface Connection {
  /** Connection ID */
  id: string;
  /** Remote peer info */
  remote: PeerConnection;
  /** Client for calling remote procedures */
  client: Client;
  /** Disconnect */
  disconnect(): Promise<void>;
}

// =============================================================================
// Connection Manager
// =============================================================================

/** Active connections */
const connections = new Map<string, Connection>();

/**
 * Connect to a remote peer
 */
export async function connect(options: ConnectOptions): Promise<Connection> {
  const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Detect transport type from URL if not specified
  const transport = options.transport ?? detectTransport(options.address);

  // Create appropriate client transport
  const client = createClient(options.address, transport, options.timeout);

  // Discover remote procedures
  const remoteProcedures = await discoverProcedures(client, options.localPeerId);

  // Create connection object
  const connection: Connection = {
    id: connectionId,
    remote: {
      id: connectionId,
      remotePeerId: remoteProcedures.peerId,
      transport,
      state: "connected",
      remoteProcedures: remoteProcedures.procedures,
      connectedAt: new Date(),
    },
    client,
    async disconnect() {
      await client.close();
      connections.delete(connectionId);
    },
  };

  connections.set(connectionId, connection);
  return connection;
}

/**
 * Get connection by ID
 */
export function getConnection(connectionId: string): Connection | undefined {
  return connections.get(connectionId);
}

/**
 * Disconnect a connection
 */
export async function disconnect(connectionId: string): Promise<boolean> {
  const connection = connections.get(connectionId);
  if (!connection) {
    return false;
  }
  await connection.disconnect();
  return true;
}

/**
 * Get all active connection IDs
 */
export function getConnectionIds(): string[] {
  return Array.from(connections.keys());
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Detect transport type from URL
 */
function detectTransport(address: string): TransportType {
  if (address.startsWith("ws://") || address.startsWith("wss://")) {
    return "websocket";
  }
  if (address.startsWith("http://") || address.startsWith("https://")) {
    return "http";
  }
  if (address.startsWith("local://")) {
    return "local";
  }
  // Default to HTTP
  return "http";
}

/**
 * Create client with appropriate transport
 */
function createClient(
  address: string,
  transport: TransportType,
  timeout?: number
): Client {
  switch (transport) {
    case "http": {
      const httpOptions: HttpTransportOptions = {
        baseUrl: address,
        urlStrategy: defaultUrlPattern.format,
        httpMethodStrategy: postOnlyStrategy,
      };
      if (timeout !== undefined) {
        httpOptions.timeout = timeout;
      }
      return new Client({
        transport: new HttpTransport(httpOptions),
      });
    }

    case "websocket":
      return new Client({
        transport: new WebSocketTransport({
          url: address,
          connectionTimeout: timeout ?? 10000,
          reconnect: {
            enabled: true,
            maxAttempts: 3,
          },
        }),
      });

    case "local":
      throw new Error("Local transport for outbound connections not yet implemented");

    default:
      throw new Error(`Unknown transport type: ${transport}`);
  }
}

/**
 * Discover procedures on remote peer
 */
async function discoverProcedures(
  client: Client,
  localPeerId?: string
): Promise<{ peerId: string; procedures: ProcedureInfo[] }> {
  try {
    // Build payload - only include peerId if defined
    const payload: { peerId?: string } = {};
    if (localPeerId !== undefined) {
      payload.peerId = localPeerId;
    }

    // Call the discovery endpoint
    const response = await client.call<
      { peerId?: string },
      ProcedureAnnounceMessage
    >(
      { service: "_discovery", operation: "announce" },
      payload
    );

    return {
      peerId: response.peerId,
      procedures: response.procedures,
    };
  } catch (error) {
    // If discovery fails, return empty procedures
    // The connection is still valid, just no auto-discovery
    console.warn("Procedure discovery failed:", error);
    return {
      peerId: "unknown",
      procedures: [],
    };
  }
}
