/**
 * Type definitions for client-connection procedures
 */
import { z } from "zod";
export declare const ConnectionInfoSchema: z.ZodObject<{
    id: z.ZodString;
    connectedAt: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    procedures: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;
export type ConnectionInfo = z.infer<typeof ConnectionInfoSchema>;
export declare const ListInputSchema: z.ZodObject<{
    serverId: z.ZodOptional<z.ZodString>;
}>;
export type ListInput = z.infer<typeof ListInputSchema>;
export interface ListOutput {
    /** List of connected clients */
    connections: ConnectionInfo[];
}
export declare const GetInputSchema: z.ZodObject<{
    clientId: z.ZodString;
}>;
export type GetInput = z.infer<typeof GetInputSchema>;
export interface GetOutput {
    /** Connection information */
    connection: ConnectionInfo | null;
}
export declare const CallInputSchema: z.ZodObject<{
    clientId: z.ZodString;
    path: z.ZodArray<z.ZodString>;
    input: z.ZodOptional<z.ZodUnknown>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type CallInput = z.infer<typeof CallInputSchema>;
export interface CallOutput {
    /** Result from the procedure call */
    result: unknown;
    /** Client ID that was called */
    clientId: string;
}
export declare const BroadcastInputSchema: z.ZodObject<{
    path: z.ZodArray<z.ZodString>;
    input: z.ZodOptional<z.ZodUnknown>;
    waitForResponses: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type BroadcastInput = z.infer<typeof BroadcastInputSchema>;
export interface BroadcastOutput {
    /** Number of clients message was sent to */
    sent: number;
    /** Results from clients (if waitForResponses=true) */
    results?: Array<{
        clientId: string;
        result?: unknown;
        error?: string;
    }>;
}
export declare const SubscribeInputSchema: z.ZodObject<{
    topic: z.ZodString;
    clientId: z.ZodOptional<z.ZodString>;
}>;
export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;
export interface SubscribeOutput {
    /** Subscription ID */
    subscriptionId: string;
    /** Topic subscribed to */
    topic: string;
}
export declare const UnsubscribeInputSchema: z.ZodObject<{
    subscriptionId: z.ZodString;
}>;
export type UnsubscribeInput = z.infer<typeof UnsubscribeInputSchema>;
export interface UnsubscribeOutput {
    /** Whether the unsubscription was successful */
    success: boolean;
    /** Subscription ID that was cancelled */
    subscriptionId: string;
}
export declare const PublishInputSchema: z.ZodObject<{
    topic: z.ZodString;
    data: z.ZodUnknown;
}>;
export type PublishInput = z.infer<typeof PublishInputSchema>;
export interface PublishOutput {
    /** Number of subscribers that received the message */
    delivered: number;
    /** Topic published to */
    topic: string;
}
export interface ConnectionProcedures {
    connection: {
        list: {
            input: ListInput;
            output: ListOutput;
        };
        get: {
            input: GetInput;
            output: GetOutput;
        };
        call: {
            input: CallInput;
            output: CallOutput;
        };
        broadcast: {
            input: BroadcastInput;
            output: BroadcastOutput;
        };
        subscribe: {
            input: SubscribeInput;
            output: SubscribeOutput;
        };
        unsubscribe: {
            input: UnsubscribeInput;
            output: UnsubscribeOutput;
        };
        publish: {
            input: PublishInput;
            output: PublishOutput;
        };
    };
}
//# sourceMappingURL=types.d.ts.map