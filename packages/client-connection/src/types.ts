/**
 * Type definitions for client-connection procedures
 */

import { z } from "zod";

// =============================================================================
// ConnectionInfo - Core type for connection information
// =============================================================================

export const ConnectionInfoSchema: z.ZodObject<{
  id: z.ZodString;
  connectedAt: z.ZodString;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  procedures: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  /** Unique connection ID */
  id: z.string(),
  /** When the connection was established (ISO string) */
  connectedAt: z.string(),
  /** Connection metadata (optional) */
  metadata: z.record(z.unknown()).optional(),
  /** Available procedures on this connection (optional) */
  procedures: z.array(z.string()).optional(),
});

export type ConnectionInfo = z.infer<typeof ConnectionInfoSchema>;

// =============================================================================
// connection.list - List all connected clients
// =============================================================================

export const ListInputSchema: z.ZodObject<{
  serverId: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Filter by server ID (optional) */
  serverId: z.string().optional(),
});

export type ListInput = z.infer<typeof ListInputSchema>;

export interface ListOutput {
  /** List of connected clients */
  connections: ConnectionInfo[];
}

// =============================================================================
// connection.get - Get specific connection info
// =============================================================================

export const GetInputSchema: z.ZodObject<{
  clientId: z.ZodString;
}> = z.object({
  /** Client ID to get info for */
  clientId: z.string(),
});

export type GetInput = z.infer<typeof GetInputSchema>;

export interface GetOutput {
  /** Connection information */
  connection: ConnectionInfo | null;
}

// =============================================================================
// connection.call - Call procedure on specific client
// =============================================================================

export const CallInputSchema: z.ZodObject<{
  clientId: z.ZodString;
  path: z.ZodArray<z.ZodString>;
  input: z.ZodOptional<z.ZodUnknown>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Client ID to call procedure on */
  clientId: z.string(),
  /** Procedure path to call */
  path: z.array(z.string()),
  /** Input to pass to procedure */
  input: z.unknown().optional(),
  /** Timeout in milliseconds (optional) */
  timeout: z.number().optional(),
});

export type CallInput = z.infer<typeof CallInputSchema>;

export interface CallOutput {
  /** Result from the procedure call */
  result: unknown;
  /** Client ID that was called */
  clientId: string;
}

// =============================================================================
// connection.broadcast - Call procedure on all connected clients
// =============================================================================

export const BroadcastInputSchema: z.ZodObject<{
  path: z.ZodArray<z.ZodString>;
  input: z.ZodOptional<z.ZodUnknown>;
  waitForResponses: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Procedure path to call */
  path: z.array(z.string()),
  /** Input to pass to procedure */
  input: z.unknown().optional(),
  /** Wait for responses (default: false) */
  waitForResponses: z.boolean().optional().default(false),
  /** Timeout in milliseconds (optional) */
  timeout: z.number().optional(),
});

export type BroadcastInput = z.infer<typeof BroadcastInputSchema>;

export interface BroadcastOutput {
  /** Number of clients message was sent to */
  sent: number;
  /** Results from clients (if waitForResponses=true) */
  results?: Array<{ clientId: string; result?: unknown; error?: string }>;
}

// =============================================================================
// connection.subscribe - Subscribe to a topic
// =============================================================================

export const SubscribeInputSchema: z.ZodObject<{
  topic: z.ZodString;
  clientId: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Topic to subscribe to */
  topic: z.string(),
  /** Client ID (auto-filled from context) */
  clientId: z.string().optional(),
});

export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;

export interface SubscribeOutput {
  /** Subscription ID */
  subscriptionId: string;
  /** Topic subscribed to */
  topic: string;
}

// =============================================================================
// connection.unsubscribe - Unsubscribe from a topic
// =============================================================================

export const UnsubscribeInputSchema: z.ZodObject<{
  subscriptionId: z.ZodString;
}> = z.object({
  /** Subscription ID to cancel */
  subscriptionId: z.string(),
});

export type UnsubscribeInput = z.infer<typeof UnsubscribeInputSchema>;

export interface UnsubscribeOutput {
  /** Whether the unsubscription was successful */
  success: boolean;
  /** Subscription ID that was cancelled */
  subscriptionId: string;
}

// =============================================================================
// connection.publish - Publish data to topic subscribers
// =============================================================================

export const PublishInputSchema: z.ZodObject<{
  topic: z.ZodString;
  data: z.ZodUnknown;
}> = z.object({
  /** Topic to publish to */
  topic: z.string(),
  /** Data to publish */
  data: z.unknown(),
});

export type PublishInput = z.infer<typeof PublishInputSchema>;

export interface PublishOutput {
  /** Number of subscribers that received the message */
  delivered: number;
  /** Topic published to */
  topic: string;
}

// =============================================================================
// Typed interface for autocomplete
// =============================================================================

export interface ConnectionProcedures {
  connection: {
    list: { input: ListInput; output: ListOutput };
    get: { input: GetInput; output: GetOutput };
    call: { input: CallInput; output: CallOutput };
    broadcast: { input: BroadcastInput; output: BroadcastOutput };
    subscribe: { input: SubscribeInput; output: SubscribeOutput };
    unsubscribe: { input: UnsubscribeInput; output: UnsubscribeOutput };
    publish: { input: PublishInput; output: PublishOutput };
  };
}
