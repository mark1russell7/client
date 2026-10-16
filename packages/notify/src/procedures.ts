/**
 * The procedure of `@procedures/notify`: `notify.send`.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { z } from "zod";
import { sendNotification } from "./notify.js";

const SendInput = z.object({
  topic: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .describe("The ntfy topic. On the public server, anyone who knows the topic can read it: use a long random name."),
  title: z.string().min(1).max(250).describe("The title of the notification"),
  message: z.string().max(4096).describe("The text of the notification. Do not send private content to a public server."),
  priority: z.enum(["min", "low", "default", "high", "max"]).default("default").describe("The priority (default: default)"),
  tags: z.array(z.string().min(1)).max(10).optional().describe("Tags; ntfy shows a known tag (warning, check) as an emoji"),
  click: z.url().optional().describe("The address that a tap on the notification opens"),
  server: z.url().optional().describe("Another ntfy server (default: https://ntfy.sh)"),
  tokenEnv: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional()
    .describe("The name of the environment variable with the access token of a protected topic. The token is never an input."),
  timeoutMs: z.number().int().positive().max(120_000).default(20_000).describe("The time limit, in milliseconds (default: 20000)"),
});
type SendInput = z.infer<typeof SendInput>;

interface SendOutput {
  sent: true;
}
const SendOutput = z.object({ sent: z.literal(true) });

export const notifySendProcedure: AnyProcedure = createProcedure()
  .path(["notify", "send"])
  .input(zodAdapter<SendInput>(SendInput))
  .output(zodAdapter<SendOutput>(SendOutput))
  .meta({
    description: "Send a push notification through ntfy",
    args: ["topic", "title", "message"],
    output: "json",
    // It adds a message on a server and deletes nothing. A second call sends a second notification.
    effects: { reads: [], writes: ["network"], destructive: false },
  })
  .handler(async (input: SendInput, ctx?: ProcedureContext): Promise<SendOutput> => {
    const token = input.tokenEnv === undefined ? undefined : process.env[input.tokenEnv];
    if (input.tokenEnv !== undefined && !token) throw new Error(`Set the environment variable ${input.tokenEnv} to the access token`);
    await sendNotification(input, { server: input.server, token, timeoutMs: input.timeoutMs, signal: ctx?.signal });
    return { sent: true };
  })
  .build() as AnyProcedure;

export const notifyProcedures: AnyProcedure[] = [notifySendProcedure];
