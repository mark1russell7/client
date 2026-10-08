/**
 * Type definitions for client-connection procedures
 */
import { z } from "zod";
// =============================================================================
// ConnectionInfo - Core type for connection information
// =============================================================================
export const ConnectionInfoSchema = z.object({
    /** Unique connection ID */
    id: z.string(),
    /** When the connection was established (ISO string) */
    connectedAt: z.string(),
    /** Connection metadata (optional) */
    metadata: z.record(z.unknown()).optional(),
    /** Available procedures on this connection (optional) */
    procedures: z.array(z.string()).optional(),
});
// =============================================================================
// connection.list - List all connected clients
// =============================================================================
export const ListInputSchema = z.object({
    /** Filter by server ID (optional) */
    serverId: z.string().optional(),
});
// =============================================================================
// connection.get - Get specific connection info
// =============================================================================
export const GetInputSchema = z.object({
    /** Client ID to get info for */
    clientId: z.string(),
});
// =============================================================================
// connection.call - Call procedure on specific client
// =============================================================================
export const CallInputSchema = z.object({
    /** Client ID to call procedure on */
    clientId: z.string(),
    /** Procedure path to call */
    path: z.array(z.string()),
    /** Input to pass to procedure */
    input: z.unknown().optional(),
    /** Timeout in milliseconds (optional) */
    timeout: z.number().optional(),
});
// =============================================================================
// connection.broadcast - Call procedure on all connected clients
// =============================================================================
export const BroadcastInputSchema = z.object({
    /** Procedure path to call */
    path: z.array(z.string()),
    /** Input to pass to procedure */
    input: z.unknown().optional(),
    /** Wait for responses (default: false) */
    waitForResponses: z.boolean().optional().default(false),
    /** Timeout in milliseconds (optional) */
    timeout: z.number().optional(),
});
// =============================================================================
// connection.subscribe - Subscribe to a topic
// =============================================================================
export const SubscribeInputSchema = z.object({
    /** Topic to subscribe to */
    topic: z.string(),
    /** Client ID (auto-filled from context) */
    clientId: z.string().optional(),
});
// =============================================================================
// connection.unsubscribe - Unsubscribe from a topic
// =============================================================================
export const UnsubscribeInputSchema = z.object({
    /** Subscription ID to cancel */
    subscriptionId: z.string(),
});
// =============================================================================
// connection.publish - Publish data to topic subscribers
// =============================================================================
export const PublishInputSchema = z.object({
    /** Topic to publish to */
    topic: z.string(),
    /** Data to publish */
    data: z.unknown(),
});
//# sourceMappingURL=types.js.map