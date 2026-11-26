/**
 * The headers and the whole messages of the recent messages of an IMAP mailbox. It opens the
 * mailbox read only (EXAMINE) and fetches with BODY.PEEK, so it changes no flag: a message stays
 * unread.
 */

import type { MailAddress } from "./mime.js";

/** The part of an IMAP client that this module uses (the shape of `imapflow`). */
export interface ImapClientLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  close(): void;
  getMailboxLock(mailbox: string, options?: { readOnly?: boolean }): Promise<{ release(): void }>;
  /** The open mailbox, with its UIDVALIDITY */
  readonly mailbox?: { uidValidity?: bigint | number | undefined } | false | undefined;
  fetch(
    range: { since: Date } | string,
    query: { envelope?: true; flags?: true; uid: true; size?: true; source?: true },
    options?: { uid?: boolean }
  ): AsyncIterable<{
    uid: number;
    size?: number | undefined;
    source?: Uint8Array | undefined;
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

const toHeader = (message: {
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
}): MailHeader => {
  const envelope = message.envelope;
  return {
    uid: message.uid,
    subject: envelope?.subject ?? "",
    from: addresses(envelope?.from),
    to: addresses(envelope?.to),
    ...(envelope?.date ? { date: envelope.date.toISOString() } : {}),
    seen: message.flags?.has("\\Seen") ?? false,
  };
};

/**
 * One session: it connects, opens the mailbox read only, runs `work` and logs out. A time limit or
 * an abort closes the connection.
 */
async function withMailbox<T>(
  connection: ImapConnection,
  options: ReadHeadersOptions,
  work: (client: ImapClientLike) => Promise<T>
): Promise<T> {
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
    let result: T;
    try {
      result = await work(client);
    } finally {
      lock.release();
    }
    await client.logout();
    loggedOut = true;
    return result;
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

/**
 * This function gives the headers of the messages of a mailbox since a date, the newest first, at
 * most `limit`. A time limit or an abort closes the connection.
 */
export async function readHeaders(connection: ImapConnection, options: ReadHeadersOptions): Promise<MailHeader[]> {
  return withMailbox(connection, options, async (client) => {
    const headers: MailHeader[] = [];
    for await (const message of client.fetch({ since: options.since }, { envelope: true, flags: true, uid: true })) headers.push(toHeader(message));
    return headers.sort((a, b) => b.uid - a.uid).slice(0, options.limit);
  });
}

/** One whole message, with its headers. */
export interface MailMessage extends MailHeader {
  /** The size of the message in bytes, as the server gives it */
  readonly size: number;
  /** The whole message (RFC 5322). It is absent when the message is larger than `maxBytes`. */
  readonly source?: Uint8Array | undefined;
}

export interface ReadMessagesOptions extends ReadHeadersOptions {
  /** The largest message to fetch, in bytes. A larger message comes with its headers and no source. */
  readonly maxBytes: number;
  /** Give only the messages with a UID above this one (the cursor of the last read) */
  readonly afterUid?: number | undefined;
}

export interface MailMessages {
  /**
   * The UIDVALIDITY of the mailbox, as a decimal string. When it changes, the UIDs of the mailbox
   * changed, and a cursor (`afterUid`) of an earlier read is not valid.
   */
  readonly uidValidity?: string | undefined;
  /** The newest first, at most `limit` */
  readonly messages: MailMessage[];
}

/**
 * This function gives the whole messages of a mailbox since a date, the newest first, at most
 * `limit`. It reads the sizes first, then fetches with BODY.PEEK only the messages up to
 * `maxBytes`, so a message stays unread. A time limit or an abort closes the connection.
 */
export async function readMessages(connection: ImapConnection, options: ReadMessagesOptions): Promise<MailMessages> {
  if (!(options.maxBytes > 0)) throw new Error("maxBytes must be a positive number of bytes");
  return withMailbox(connection, options, async (client) => {
    const found: Array<{ header: MailHeader; size: number }> = [];
    for await (const message of client.fetch({ since: options.since }, { envelope: true, flags: true, uid: true, size: true })) {
      if (options.afterUid !== undefined && message.uid <= options.afterUid) continue;
      found.push({ header: toHeader(message), size: message.size ?? 0 });
    }
    const chosen = found.sort((a, b) => b.header.uid - a.header.uid).slice(0, options.limit);
    const wanted = chosen.filter((entry) => entry.size <= options.maxBytes).map((entry) => entry.header.uid);
    const sources = new Map<number, Uint8Array>();
    if (wanted.length > 0) {
      for await (const message of client.fetch(wanted.join(","), { uid: true, source: true }, { uid: true })) {
        if (message.source !== undefined && message.source.byteLength <= options.maxBytes) sources.set(message.uid, message.source);
      }
    }
    const box = client.mailbox;
    const uidValidity = box && box.uidValidity !== undefined ? String(box.uidValidity) : undefined;
    return {
      ...(uidValidity !== undefined ? { uidValidity } : {}),
      messages: chosen.map(({ header, size }) => {
        const source = sources.get(header.uid);
        return { ...header, size, ...(source !== undefined ? { source } : {}) };
      }),
    };
  });
}
