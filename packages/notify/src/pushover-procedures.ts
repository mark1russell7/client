/**
 * The Pushover procedures of `@procedures/notify`: `notify.pushover.send`, `notify.pushover.receipt`,
 * `notify.pushover.cancel`, `notify.pushover.validate` and `notify.pushover.limits`.
 *
 * Each procedure reads the API token from an environment variable, not from its input. Each one
 * gives the result of its extractor: a failure is a value with `ok: false`, not an error.
 */

import { createProcedure, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import * as z from "zod";
import {
  PUSHOVER_EXPIRE_MAX_MS,
  PUSHOVER_KEY as KEY,
  PUSHOVER_LIMITS,
  PUSHOVER_RETRY_MIN_MS,
  callPushover,
  extractPushoverCancelled,
  extractPushoverLimits,
  extractPushoverReceipt,
  extractPushoverSent,
  extractPushoverValidated,
  pushoverCancelByTagRequest,
  pushoverCancelRequest,
  pushoverLimitsRequest,
  pushoverReceiptRequest,
  pushoverSendRequest,
  pushoverValidateRequest,
  type PushoverFailure,
  type PushoverPriority,
  type PushoverRequest,
  type PushoverResponse,
} from "./pushover.js";

/**
 * The names of the variables that `tokenEnv` and `userEnv` can name: `PUSHOVER_`, then capital
 * letters, digits and underscores. Thus a caller cannot send another secret of the host to Pushover.
 */
export const PUSHOVER_ENV: RegExp = /^PUSHOVER_[A-Z0-9_]+$/;

const envName = (fallback: string, what: string): z.ZodDefault<z.ZodString> =>
  z
    .string()
    .regex(PUSHOVER_ENV, `${what} names a variable that starts with PUSHOVER_, for example ${fallback}`)
    .default(fallback)
    .describe(`The name of the environment variable with the ${what === "tokenEnv" ? "API token of the application" : "user key"} (default: ${fallback})`);

const common = {
  tokenEnv: envName("PUSHOVER_APP_TOKEN", "tokenEnv"),
  timeoutMs: z.number().int().positive().max(120_000).default(20_000).describe("The time limit, in milliseconds (default: 20000)"),
};

/** A result of a Pushover procedure: `ok`, and the fields of the success or of the failure. */
const ResultSchema = z.looseObject({ ok: z.boolean() });
type Result = z.infer<typeof ResultSchema>;

function secret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set the environment variable ${name}`);
  return value;
}

async function call<Success extends object>(
  request: PushoverRequest,
  extract: (response: PushoverResponse) => Success | PushoverFailure,
  timeoutMs: number,
  ctx: ProcedureContext | undefined,
): Promise<Result> {
  return (await callPushover(fetch, request, extract, { timeoutMs, signal: ctx?.signal })) as unknown as Result;
}

const SendInputSchema = z.object({
  user: z.string().optional().describe("The user key or the group key of the recipient. Without it, the procedure reads userEnv."),
  userEnv: envName("PUSHOVER_USER_KEY", "userEnv"),
  message: z.string().min(1).describe(`The text, ${PUSHOVER_LIMITS.message} characters at most`),
  title: z.string().optional().describe(`The title, ${PUSHOVER_LIMITS.title} characters at most`),
  url: z.string().optional().describe("An address that the notification opens"),
  urlTitle: z.string().optional().describe("The text of the address"),
  priority: z
    .union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)])
    .default(0)
    .describe("-2 no notification, -1 no sound, 0 normal, 1 high, 2 emergency: it repeats until acknowledged (default: 0)"),
  retryMs: z.number().int().min(PUSHOVER_RETRY_MIN_MS).optional().describe("Priority 2: the time between two repeats, 30000 or more"),
  expireMs: z.number().int().positive().max(PUSHOVER_EXPIRE_MAX_MS).optional().describe("Priority 2: the time after which the repeats stop, 10800000 at most"),
  callback: z.url().optional().describe("Priority 2: an address that gets a POST when the user acknowledges"),
  tags: z.array(z.string().min(1)).max(20).optional().describe("Priority 2: tags, for notify.pushover.cancel with tag"),
  sound: z.string().optional().describe("The name of a sound"),
  devices: z.array(z.string()).optional().describe("The names of the devices that get the message (default: each device)"),
  format: z.enum(["text", "html", "monospace"]).default("text").describe("The format of the text (default: text)"),
  ttlMs: z.number().int().min(1000).optional().describe("The time after which the device deletes the message. Priority 2 ignores it."),
  ...common,
});
type SendInput = z.infer<typeof SendInputSchema>;

export const pushoverSendProcedure: AnyProcedure = createProcedure()
  .path(["notify", "pushover", "send"])
  .input(SendInputSchema)
  .output(ResultSchema)
  .meta({
    description: "Send a Pushover message. Priority 2 repeats until the user acknowledges it, and gives a receipt.",
    args: ["message"],
    output: "json",
    // It adds a message and deletes nothing. A second call sends a second message.
    effects: { reads: [], writes: ["network"], destructive: false },
  })
  .handler(async (input: SendInput, ctx?: ProcedureContext): Promise<Result> => {
    const priority = input.priority as PushoverPriority;
    if (priority === 2 && (input.retryMs === undefined || input.expireMs === undefined)) throw new Error("Priority 2 needs retryMs and expireMs");
    const user = input.user ?? secret(input.userEnv);
    const request = pushoverSendRequest(secret(input.tokenEnv), {
      user,
      message: input.message,
      title: input.title,
      url: input.url,
      urlTitle: input.urlTitle,
      priority,
      emergency:
        priority === 2 && input.retryMs !== undefined && input.expireMs !== undefined
          ? { retryMs: input.retryMs, expireMs: input.expireMs, callback: input.callback, tags: input.tags }
          : undefined,
      sound: input.sound,
      devices: input.devices,
      format: input.format,
      ttlMs: input.ttlMs,
    });
    return call(request, extractPushoverSent, input.timeoutMs, ctx);
  })
  .build();

const ReceiptInputSchema = z.object({
  receipt: z.string().regex(KEY, "A receipt is 30 letters and digits").describe("The receipt of an emergency message"),
  ...common,
});
type ReceiptInput = z.infer<typeof ReceiptInputSchema>;

export const pushoverReceiptProcedure: AnyProcedure = createProcedure()
  .path(["notify", "pushover", "receipt"])
  .input(ReceiptInputSchema)
  .output(ResultSchema)
  .meta({
    description: "Read the receipt of a Pushover emergency message: acknowledged, by which device, expired. Read it at most once in 5 s.",
    args: ["receipt"],
    output: "json",
    effects: { reads: ["network"], writes: [], destructive: false },
  })
  .handler(async (input: ReceiptInput, ctx?: ProcedureContext): Promise<Result> =>
    call(pushoverReceiptRequest(secret(input.tokenEnv), input.receipt), extractPushoverReceipt, input.timeoutMs, ctx),
  )
  .build();

const CancelInputSchema = z
  .object({
    receipt: z.string().regex(KEY, "A receipt is 30 letters and digits").optional().describe("The receipt of the message to stop"),
    tag: z.string().min(1).optional().describe("Stop each emergency message of the application with this tag"),
    ...common,
  })
  .refine((input) => (input.receipt === undefined) !== (input.tag === undefined), { message: "Give receipt or tag, not both" });
type CancelInput = z.infer<typeof CancelInputSchema>;

export const pushoverCancelProcedure: AnyProcedure = createProcedure()
  .path(["notify", "pushover", "cancel"])
  .input(CancelInputSchema)
  .output(ResultSchema)
  .meta({
    description: "Stop the repeats of a Pushover emergency message, by its receipt or by a tag",
    args: [],
    output: "json",
    // It stops the repeats and deletes no message. A second cancel has no effect.
    effects: { reads: [], writes: ["network"], destructive: false, idempotent: true },
  })
  .handler(async (input: CancelInput, ctx?: ProcedureContext): Promise<Result> => {
    const token = secret(input.tokenEnv);
    const request = input.receipt !== undefined ? pushoverCancelRequest(token, input.receipt) : pushoverCancelByTagRequest(token, input.tag ?? "");
    return call(request, extractPushoverCancelled, input.timeoutMs, ctx);
  })
  .build();

const ValidateInputSchema = z.object({
  user: z.string().optional().describe("The user key to examine. Without it, the procedure reads userEnv."),
  userEnv: envName("PUSHOVER_USER_KEY", "userEnv"),
  device: z.string().optional().describe("The name of a device to examine"),
  ...common,
});
type ValidateInput = z.infer<typeof ValidateInputSchema>;

export const pushoverValidateProcedure: AnyProcedure = createProcedure()
  .path(["notify", "pushover", "validate"])
  .input(ValidateInputSchema)
  .output(ResultSchema)
  .meta({
    description: "Examine a Pushover user key: its active devices and licenses. It sends no message.",
    args: [],
    output: "json",
    effects: { reads: ["network"], writes: [], destructive: false },
  })
  .handler(async (input: ValidateInput, ctx?: ProcedureContext): Promise<Result> =>
    call(
      pushoverValidateRequest(secret(input.tokenEnv), input.user ?? secret(input.userEnv), input.device),
      extractPushoverValidated,
      input.timeoutMs,
      ctx,
    ),
  )
  .build();

const LimitsInputSchema = z.object({ ...common });
type LimitsInput = z.infer<typeof LimitsInputSchema>;

export const pushoverLimitsProcedure: AnyProcedure = createProcedure()
  .path(["notify", "pushover", "limits"])
  .input(LimitsInputSchema)
  .output(ResultSchema)
  .meta({
    description: "Read the monthly message limit of the Pushover application, the messages left and the reset time",
    args: [],
    output: "json",
    effects: { reads: ["network"], writes: [], destructive: false },
  })
  .handler(async (input: LimitsInput, ctx?: ProcedureContext): Promise<Result> =>
    call(pushoverLimitsRequest(secret(input.tokenEnv)), extractPushoverLimits, input.timeoutMs, ctx),
  )
  .build();

export const pushoverProcedures: AnyProcedure[] = [
  pushoverSendProcedure,
  pushoverReceiptProcedure,
  pushoverCancelProcedure,
  pushoverValidateProcedure,
  pushoverLimitsProcedure,
];
