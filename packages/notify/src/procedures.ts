/**
 * The procedure of `@procedures/notify`: `notify.send`.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { z } from "zod";
import { sendNotification } from "./notify.js";

/**
 * The names of the variables that `tokenEnv` of `notify.send` names: `NTFY_` or `NOTIFY_`, then
 * letters, digits and underscores (audit pass 2, O55). The caller chooses the server, so a free
 * name lets it send any secret of the host, for example `GITHUB_TOKEN`, to its own server.
 *
 * In 0.28, another name still works, with a deprecation notice. Version 0.33.0 refuses it.
 */
export const NOTIFY_TOKEN_ENV: RegExp = /^(?:NTFY|NOTIFY)_[A-Za-z0-9_]+$/;

/** The codes of the deprecation notices that this process emitted. */
const emitted = new Set<string>();

/** This function emits a deprecation notice one time in each process. */
function deprecationNotice(code: string, message: string): void {
  if (emitted.has(code)) return;
  emitted.add(code);
  process.emitWarning(message, { type: "DeprecationWarning", code });
}

/** The notice of a `tokenEnv` without the prefix `NTFY_` or `NOTIFY_`. */
const TOKEN_ENV_NOTICE =
  "tokenEnv of notify.send names a variable without the prefix NTFY_ or NOTIFY_. @procedures/notify 0.33.0 refuses such a name. " +
  "Rename the variable, for example PHONE_TOKEN to NTFY_TOKEN, and give the new name in tokenEnv.";

const SendInputSchema = z.object({
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
    .describe(
      "The name of the environment variable with the access token of a protected topic: NTFY_ or NOTIFY_ and more. Another name is deprecated. The token is never an input."
    ),
  timeoutMs: z.number().int().positive().max(120_000).default(20_000).describe("The time limit, in milliseconds (default: 20000)"),
});
type SendInput = z.infer<typeof SendInputSchema>;

interface SendOutput {
  sent: true;
}
const SendOutputSchema = z.object({ sent: z.literal(true) });

export const notifySendProcedure: AnyProcedure = createProcedure()
  .path(["notify", "send"])
  .input(zodAdapter<SendInput>(SendInputSchema))
  .output(zodAdapter<SendOutput>(SendOutputSchema))
  .meta({
    description: "Send a push notification through ntfy",
    args: ["topic", "title", "message"],
    output: "json",
    // It adds a message on a server and deletes nothing. A second call sends a second notification.
    effects: { reads: [], writes: ["network"], destructive: false },
  })
  .handler(async (input: SendInput, ctx?: ProcedureContext): Promise<SendOutput> => {
    // Deprecated (O55): 0.33.0 refuses a name without the prefix
    if (input.tokenEnv !== undefined && !NOTIFY_TOKEN_ENV.test(input.tokenEnv)) deprecationNotice("PROCEDURES_NOTIFY_TOKEN_ENV", TOKEN_ENV_NOTICE);
    const token = input.tokenEnv === undefined ? undefined : process.env[input.tokenEnv];
    if (input.tokenEnv !== undefined && !token) throw new Error(`Set the environment variable ${input.tokenEnv} to the access token`);
    await sendNotification(input, { server: input.server, token, timeoutMs: input.timeoutMs, signal: ctx?.signal });
    return { sent: true };
  })
  .build() as AnyProcedure;

export const notifyProcedures: AnyProcedure[] = [notifySendProcedure];
