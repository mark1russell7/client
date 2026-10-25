/**
 * The procedures of `@procedures/mail`: `mail.parse` and `mail.headers`.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { z } from "zod";
import { readHeaders, type ImapClientFactory, type MailHeader } from "./imap.js";
import { decodeWords, messageHeaders, messageText, parseAddresses, type MailAddress } from "./mime.js";

const addressSchema = z.object({ name: z.string().optional(), address: z.string() });

// =============================================================================
// mail.parse
// =============================================================================

const ParseInputSchema = z.object({
  raw: z.string().describe("The raw message (RFC 822): the headers, an empty line, the body"),
});
type ParseInput = z.infer<typeof ParseInputSchema>;

interface ParseOutput {
  headers: Record<string, string>;
  subject?: string | undefined;
  from: MailAddress[];
  to: MailAddress[];
  date?: string | undefined;
  text: string;
}
const ParseOutputSchema = z.object({
  headers: z.record(z.string(), z.string()),
  subject: z.string().optional(),
  from: z.array(addressSchema),
  to: z.array(addressSchema),
  date: z.string().optional(),
  text: z.string(),
});

/** This function gives the headers, the addresses and the text of a raw message. */
export function parseMessage(raw: string): ParseOutput {
  const headers = messageHeaders(raw);
  const subject = headers.get("subject");
  const dateHeader = headers.get("date");
  const date = dateHeader !== undefined && !Number.isNaN(Date.parse(dateHeader)) ? new Date(dateHeader).toISOString() : undefined;
  return {
    headers: Object.fromEntries(headers),
    ...(subject !== undefined ? { subject: decodeWords(subject) } : {}),
    from: parseAddresses(headers.get("from") ?? ""),
    to: parseAddresses(headers.get("to") ?? ""),
    ...(date !== undefined ? { date } : {}),
    text: messageText(raw),
  };
}

export const mailParseProcedure: AnyProcedure = createProcedure()
  .path(["mail", "parse"])
  .input(zodAdapter<ParseInput>(ParseInputSchema))
  .output(zodAdapter<ParseOutput>(ParseOutputSchema))
  .meta({
    description: "Read the headers, the addresses and the text of a raw email message",
    output: "json",
    effects: { reads: [], writes: [] },
  })
  .handler(async (input: ParseInput): Promise<ParseOutput> => parseMessage(input.raw))
  .build() as AnyProcedure;

// =============================================================================
// mail.headers
// =============================================================================

/**
 * The names of the variables that `passwordEnv` of `mail.headers` can name: `IMAP_` or `MAIL_`,
 * then letters, digits and underscores (audit pass 2, O55). The caller chooses the host, so a
 * free name let it send any secret of the host, for example `GITHUB_TOKEN`, to its own server.
 */
export const MAIL_PASSWORD_ENV: RegExp = /^(?:IMAP|MAIL)_[A-Za-z0-9_]+$/;

const HeadersInputSchema = z.object({
  host: z.string().min(1).describe("The IMAP server, for example imap.gmail.com"),
  port: z.number().int().min(1).max(65_535).default(993).describe("The port (default: 993)"),
  secure: z.boolean().default(true).describe("Use TLS from the start (default: true)"),
  user: z.string().min(1).describe("The user name of the mailbox"),
  passwordEnv: z
    .string()
    .regex(MAIL_PASSWORD_ENV, "passwordEnv names a variable that starts with IMAP_ or MAIL_, for example IMAP_PASSWORD")
    .default("IMAP_PASSWORD")
    .describe(
      "The name of the environment variable that holds the password: IMAP_ or MAIL_ and more (default: IMAP_PASSWORD). The password is never an input, so no log records it."
    ),
  mailbox: z.string().min(1).default("INBOX").describe("The mailbox (default: INBOX)"),
  sinceDays: z.number().int().min(1).max(365).default(1).describe("The messages of this number of days (default: 1)"),
  limit: z.number().int().min(1).max(5_000).default(200).describe("The maximum number of messages, the newest first (default: 200)"),
  timeoutMs: z.number().int().positive().max(600_000).default(60_000).describe("The time limit, in milliseconds (default: 60000)"),
});
type HeadersInput = z.infer<typeof HeadersInputSchema>;

interface HeadersOutput {
  messages: MailHeader[];
}
const HeadersOutputSchema = z.object({
  messages: z.array(
    z.object({
      uid: z.number(),
      subject: z.string(),
      from: z.array(addressSchema),
      to: z.array(addressSchema),
      date: z.string().optional(),
      seen: z.boolean(),
    })
  ),
});

/** Tests replace the IMAP client. */
let clientFactory: ImapClientFactory | undefined;

/** This function replaces the IMAP client of `mail.headers` (for tests). Undefined restores `imapflow`. */
export function setImapClientFactory(factory: ImapClientFactory | undefined): void {
  clientFactory = factory;
}

export const mailHeadersProcedure: AnyProcedure = createProcedure()
  .path(["mail", "headers"])
  .input(zodAdapter<HeadersInput>(HeadersInputSchema))
  .output(zodAdapter<HeadersOutput>(HeadersOutputSchema))
  .meta({
    description: "Give the headers of the recent messages of an IMAP mailbox, read only (no message becomes read)",
    args: ["host", "user"],
    output: "json",
    effects: { reads: ["network"], writes: [] },
  })
  .handler(async (input: HeadersInput, ctx?: ProcedureContext): Promise<HeadersOutput> => {
    const password = process.env[input.passwordEnv];
    if (!password) throw new Error(`Set the environment variable ${input.passwordEnv} to the password of the mailbox`);
    const messages = await readHeaders(
      { host: input.host, port: input.port, secure: input.secure, user: input.user, password },
      {
        mailbox: input.mailbox,
        since: new Date(Date.now() - input.sinceDays * 86_400_000),
        limit: input.limit,
        timeoutMs: input.timeoutMs,
        signal: ctx?.signal,
        clientFactory,
      }
    );
    return { messages };
  })
  .build() as AnyProcedure;

export const mailProcedures: AnyProcedure[] = [mailParseProcedure, mailHeadersProcedure];
