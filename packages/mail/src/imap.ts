/**
 * The headers of the recent messages of an IMAP mailbox. It opens the mailbox read only (EXAMINE)
 * and fetches the envelope and the flags of each message, so it changes no flag: a message stays
 * unread.
 */

import type { MailAddress } from "./mime.js";

/** The part of an IMAP client that this module uses (the shape of `imapflow`). */
export interface ImapClientLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  close(): void;
  getMailboxLock(mailbox: string, options?: { readOnly?: boolean }): Promise<{ release(): void }>;
  fetch(
    range: { since: Date },
    query: { envelope: true; flags: true; uid: true }
  ): AsyncIterable<{
    uid: number;
    flags?: Set<string> | undefined;
    envelope?:
      | {
          subject?: string | undefined;
          date?: Date | undefined;
          from?: Array<{ name?: string | undefined; address?: string | undefined }> | undefined;
          to?: Array<{ name?: string | undefined; address?: string | undefined }> | undefined;
        }
      | undefined;
  }>;
}

/** The connection of an IMAP client. */
export interface ImapConnection {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly password: string;
}

/** The headers of one message. */
export interface MailHeader {
  readonly uid: number;
  readonly subject: string;
  readonly from: MailAddress[];
  readonly to: MailAddress[];
  /** The date of the message (ISO 8601), when it has one */
  readonly date?: string | undefined;
  readonly seen: boolean;
}

export type ImapClientFactory = (connection: ImapConnection) => Promise<ImapClientLike>;

const imapflowClient: ImapClientFactory = async (connection) => {
  const { ImapFlow } = await import("imapflow");
  return new ImapFlow({
    host: connection.host,
    port: connection.port,
    secure: connection.secure,
    auth: { user: connection.user, pass: connection.password },
    logger: false,
  }) as unknown as ImapClientLike;
};

const addresses = (list: Array<{ name?: string | undefined; address?: string | undefined }> | undefined): MailAddress[] =>
  (list ?? [])
    .filter((entry): entry is { name?: string; address: string } => typeof entry.address === "string")
    .map((entry) => (entry.name ? { name: entry.name, address: entry.address } : { address: entry.address }));

export interface ReadHeadersOptions {
  readonly mailbox: string;
  readonly since: Date;
  readonly limit: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal | undefined;
  readonly clientFactory?: ImapClientFactory | undefined;
}

/**
 * This function gives the headers of the messages of a mailbox since a date, the newest first, at
 * most `limit`. A time limit or an abort closes the connection.
 */
export async function readHeaders(connection: ImapConnection, options: ReadHeadersOptions): Promise<MailHeader[]> {
  const client = await (options.clientFactory ?? imapflowClient)(connection);
  let stopped: string | undefined;
  let loggedOut = false;
  const stop = (reason: string): void => {
    stopped ??= reason;
    client.close();
  };
  const timer = setTimeout(() => stop(`no answer in ${options.timeoutMs} ms`), options.timeoutMs);
  const onAbort = (): void => stop("the call was aborted");
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (options.signal?.aborted) throw new Error("the call was aborted");
    await client.connect();
    const lock = await client.getMailboxLock(options.mailbox, { readOnly: true });
    const headers: MailHeader[] = [];
    try {
      for await (const message of client.fetch({ since: options.since }, { envelope: true, flags: true, uid: true })) {
        const envelope = message.envelope;
        headers.push({
          uid: message.uid,
          subject: envelope?.subject ?? "",
          from: addresses(envelope?.from),
          to: addresses(envelope?.to),
          ...(envelope?.date ? { date: envelope.date.toISOString() } : {}),
          seen: message.flags?.has("\\Seen") ?? false,
        });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    loggedOut = true;
    return headers.sort((a, b) => b.uid - a.uid).slice(0, options.limit);
  } catch (error) {
    if (stopped !== undefined) throw new Error(`The IMAP server did not finish: ${stopped}`);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    // An error leaves the connection open: close it
    if (!loggedOut && stopped === undefined) client.close();
  }
}
