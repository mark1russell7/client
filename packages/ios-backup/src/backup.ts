/**
 * The reader of an iPhone backup in the MobileSync format, without a native dependency.
 *
 * A backup folder holds `Manifest.db` and the files of the phone. The name of each file is its
 * `fileID`, in a subfolder with the first two characters of that name. `Manifest.db` gives the
 * `fileID` of each domain and relative path. The module reads SQLite with `node:sqlite`.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

/** The start of the Apple epoch (`2001-01-01T00:00:00Z`), in milliseconds after the Unix epoch. */
export const APPLE_EPOCH_MS = 978_307_200_000;

/** The domain of the messages database in `Manifest.db`. */
export const SMS_DOMAIN = "HomeDomain";

/** The relative path of the messages database in `Manifest.db`. */
export const SMS_RELATIVE_PATH = "Library/SMS/sms.db";

/** An Apple time above this value is in nanoseconds. A time below it is in seconds. */
const NANOSECOND_THRESHOLD = 1_000_000_000_000;

/** The kinds of `IosBackupError`. */
export type IosBackupErrorCode = "no-backup" | "encrypted" | "no-file" | "missing-file" | "invalid-file-id";

/** The name of a file of a backup: the SHA-1 of its domain and its path, 40 hexadecimal digits. */
const FILE_ID = /^[0-9a-f]{40}$/i;

/**
 * The error of a backup that the module cannot read. The `code` tells the cause:
 * `no-backup` (no backup folder), `encrypted` (`Manifest.db` is not a readable database),
 * `no-file` (`Manifest.db` does not list the file) or `missing-file` (the folder does not hold the file).
 */
export class IosBackupError extends Error {
  /** The cause of the error. */
  readonly code: IosBackupErrorCode;

  constructor(code: IosBackupErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IosBackupError";
    this.code = code;
  }
}

/** A backup folder. */
export interface BackupFolder {
  /** The path of the backup folder. */
  readonly path: string;
  /** The time of the last change to its `Manifest.db`, as an ISO 8601 string. */
  readonly modifiedAt: string;
}

/** A file of a backup. */
export interface BackupFile {
  /** The ID of the file in `Manifest.db`. */
  readonly fileId: string;
  /** The path of the file in the backup folder. */
  readonly path: string;
}

/** A message of the messages database. The names are the column names of `sms.db`. */
export interface BackupMessage {
  /** The unique ID of the message. */
  readonly guid: string;
  /** The time of the message, as an ISO 8601 string in UTC, to the second. */
  readonly date: string;
  /** The text of the message. */
  readonly text: string;
  /** True for a message that the owner of the phone sent. */
  readonly is_from_me: boolean;
  /** The phone number or the email address of the other person, when the database has one. */
  readonly handle?: string | undefined;
  /** The service of the message, for example `iMessage` or `SMS`. */
  readonly service?: string | undefined;
  /** The identifier of the chat: a phone number, an email address or a group ID. */
  readonly chat_id?: string | undefined;
  /** The name of the chat, when the chat has a name. */
  readonly chat_name?: string | undefined;
  /** True when the text comes from the `attributedBody` column, because the `text` column is empty. */
  readonly from_attributed_body?: boolean | undefined;
}

/** The filter of `readMessages` and `readSmsDatabase`. */
export interface MessageQuery {
  /** Only the messages at this time or after it (ISO 8601). */
  readonly since?: string | undefined;
  /** Only the messages before this time (ISO 8601). */
  readonly until?: string | undefined;
  /** Only the newest messages, at most this number. The result stays in time order. */
  readonly limit?: number | undefined;
}

/**
 * This function gives the default backup folders: the Apple Devices app and iTunes on Windows,
 * and Finder on macOS. A folder that does not exist gives no backups.
 */
export function defaultBackupRoots(home: string = homedir()): string[] {
  return [
    join(home, "Apple", "MobileSync", "Backup"),
    join(home, "AppData", "Roaming", "Apple Computer", "MobileSync", "Backup"),
    join(home, "Library", "Application Support", "MobileSync", "Backup"),
  ];
}

/**
 * This function lists the backup folders in the roots, the newest first. A backup folder is a
 * subfolder with a `Manifest.db`. The time of `Manifest.db` gives the order.
 */
export async function listBackups(roots: readonly string[] = defaultBackupRoots()): Promise<BackupFolder[]> {
  const found: Array<BackupFolder & { readonly mtime: number }> = [];
  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const path = join(root, entry.name);
      const info = await stat(join(path, "Manifest.db")).catch(() => undefined);
      if (info === undefined || !info.isFile()) continue;
      found.push({ path, modifiedAt: info.mtime.toISOString(), mtime: info.mtimeMs });
    }
  }
  // The sort is stable: of two folders with the same time, the first found stays first
  found.sort((a, b) => b.mtime - a.mtime);
  return found.map(({ path, modifiedAt }) => ({ path, modifiedAt }));
}

/** This function gives the newest backup folder in the roots, or `undefined` when there is none. */
export async function findLatestBackup(roots?: readonly string[]): Promise<string | undefined> {
  return (await listBackups(roots))[0]?.path;
}

/**
 * This function changes an Apple time to an ISO 8601 string in UTC, to the second. The value is
 * in nanoseconds after 2001-01-01 (iOS 11 and later), or in seconds (older databases).
 */
export function appleDateToIso(raw: number | bigint): string {
  let ms: number;
  if (typeof raw === "bigint") {
    ms = raw > BigInt(NANOSECOND_THRESHOLD) ? Number(raw / 1_000_000n) : Number(raw) * 1000;
  } else {
    ms = raw > NANOSECOND_THRESHOLD ? raw / 1e6 : raw * 1000;
  }
  return new Date(ms + APPLE_EPOCH_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** This function changes an ISO 8601 time to an Apple time in nanoseconds. */
export function isoToAppleDate(iso: string): bigint {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`Not a time: ${JSON.stringify(iso)}`);
  return BigInt(ms - APPLE_EPOCH_MS) * 1_000_000n;
}

/** The class names of the string object in a typedstream. */
const STRING_CLASSES = ["NSString", "NSMutableString"];
/** The byte after the text of a string object in a typedstream. */
const END_OF_OBJECT = 0x86;

/**
 * This function gets the plain text from the `attributedBody` column of a message: an
 * `NSAttributedString` in the typedstream format. It gives `undefined` when the value has no text.
 */
export function extractTypedstreamText(body: Uint8Array): string | undefined {
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  let marker = -1;
  for (const name of STRING_CLASSES) {
    const at = bytes.indexOf(name, 0, "latin1");
    if (at !== -1 && (marker === -1 || at < marker)) marker = at;
  }
  if (marker === -1) return undefined;
  const plus = bytes.indexOf(0x2b, marker); // "+": the start of the bytes of the string
  if (plus === -1 || plus + 1 >= bytes.length) return undefined;
  let start = plus + 1;
  const first = bytes[start] as number;
  let length: number | undefined;
  // A typedstream integer: one byte below 0x80, or 0x81 and 2 bytes, or 0x82 and 4 bytes (little-endian)
  if (first === 0x81) {
    length = start + 3 <= bytes.length ? bytes.readUInt16LE(start + 1) : undefined;
    start += 3;
  } else if (first === 0x82) {
    length = start + 5 <= bytes.length ? bytes.readUInt32LE(start + 1) : undefined;
    start += 5;
  } else {
    length = first < 0x80 ? first : undefined;
    start += 1;
  }
  if (start > bytes.length) return undefined;
  let end: number;
  if (length !== undefined && start + length <= bytes.length) {
    end = start + length;
  } else {
    // No length that agrees with the value: the text stops at the end of the object
    const stop = bytes.indexOf(END_OF_OBJECT, start);
    end = stop === -1 ? bytes.length : stop;
  }
  const text = bytes.subarray(start, end).toString("utf8").trim();
  return text.length > 0 ? text : undefined;
}

type Sqlite = typeof import("node:sqlite");

/**
 * This function loads `node:sqlite` at the first read. Thus an import of the package does not
 * show the experimental warning of `node:sqlite`, and does not fail on an older Node.
 */
async function loadSqlite(): Promise<Sqlite> {
  try {
    return await import("node:sqlite");
  } catch (error) {
    throw new Error("@procedures/ios-backup needs node:sqlite: use Node 22.13 or later", { cause: error });
  }
}

/** This function gives a new temporary folder to `use`, and deletes the folder after it. */
async function withScratch<T>(use: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "ios-backup-"));
  try {
    return await use(dir);
  } finally {
    // On Windows, a file can stay locked for some milliseconds after it closes
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
  }
}

/**
 * This function finds a file of a backup by its domain and its relative path in `Manifest.db`.
 * It gives `undefined` when `Manifest.db` does not list the file. It reads a copy of
 * `Manifest.db` in a temporary folder, and changes nothing in the backup.
 */
export async function findBackupFile(backup: string, domain: string, relativePath: string): Promise<BackupFile | undefined> {
  const manifest = join(backup, "Manifest.db");
  if (!existsSync(manifest)) throw new IosBackupError("no-backup", `The folder has no Manifest.db: ${backup}`);
  const { DatabaseSync } = await loadSqlite();
  const fileId = await withScratch(async (scratch) => {
    const copy = join(scratch, "Manifest.db");
    await copyFile(manifest, copy);
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(copy, { readOnly: true });
      const row = db.prepare("SELECT fileID FROM Files WHERE domain = ? AND relativePath = ?").get(domain, relativePath);
      const id = row?.["fileID"];
      return typeof id === "string" ? id : undefined;
    } catch (error) {
      throw new IosBackupError(
        "encrypted",
        "Cannot read Manifest.db. An encrypted backup gives this error: make a backup without encryption.",
        { cause: error },
      );
    } finally {
      db?.close();
    }
  });
  if (fileId === undefined) return undefined;
  // The name comes from Manifest.db. A name that is not a hash could leave the backup folder (`../`).
  if (!FILE_ID.test(fileId)) {
    throw new IosBackupError("invalid-file-id", `Manifest.db gives ${domain}:${relativePath} the file name ${JSON.stringify(fileId.slice(0, 60))}, which is not a hash of 40 hexadecimal digits`);
  }
  for (const path of [join(backup, fileId.slice(0, 2), fileId), join(backup, fileId)]) {
    if (existsSync(path)) return { fileId, path };
  }
  throw new IosBackupError("missing-file", `Manifest.db lists ${domain}:${relativePath}, but the backup has no file ${fileId}`);
}

/** The time of a message in nanoseconds, for the two units of `message.date`. */
const MESSAGE_NS = `(CASE WHEN m.date > ${NANOSECOND_THRESHOLD} THEN m.date ELSE m.date * 1000000000 END)`;

interface MessageRow {
  readonly guid: string;
  readonly text: string | null;
  readonly body: Uint8Array | null;
  readonly date: bigint;
  readonly is_from_me: bigint | null;
  readonly service: string | null;
  readonly handle: string | null;
  readonly chat_id: string | null;
  readonly chat_name: string | null;
}

/** This function gives the value when it is a string that is not empty. */
const present = (value: string | null): string | undefined => (value === null || value.length === 0 ? undefined : value);

/**
 * This function reads the messages of a messages database (`sms.db` of a backup, or `chat.db` of
 * macOS), in time order. It opens the file read only. A message without text is not in the result.
 */
export async function readSmsDatabase(file: string, query: MessageQuery = {}): Promise<BackupMessage[]> {
  const where = ["m.guid IS NOT NULL", "((m.text IS NOT NULL AND m.text != '') OR m.attributedBody IS NOT NULL)"];
  const parameters: Array<bigint | number> = [];
  if (query.since !== undefined) {
    where.push(`${MESSAGE_NS} >= ?`);
    parameters.push(isoToAppleDate(query.since));
  }
  if (query.until !== undefined) {
    where.push(`${MESSAGE_NS} < ?`);
    parameters.push(isoToAppleDate(query.until));
  }
  const limited = query.limit !== undefined;
  if (limited) parameters.push(Math.max(0, Math.floor(query.limit as number)));
  const sql = `SELECT m.guid AS guid, m.text AS text, m.attributedBody AS body, m.date AS date,
      m.is_from_me AS is_from_me, m.service AS service, h.id AS handle,
      c.chat_identifier AS chat_id, c.display_name AS chat_name
    FROM message m
    LEFT JOIN handle h ON h.ROWID = m.handle_id
    LEFT JOIN chat c ON c.ROWID = (
      SELECT cmj.chat_id FROM chat_message_join cmj WHERE cmj.message_id = m.ROWID ORDER BY cmj.chat_id LIMIT 1
    )
    WHERE ${where.join(" AND ")}
    ORDER BY ${MESSAGE_NS} ${limited ? "DESC" : "ASC"}, m.ROWID ${limited ? "DESC" : "ASC"}
    ${limited ? "LIMIT ?" : ""}`;

  const { DatabaseSync } = await loadSqlite();
  const db = new DatabaseSync(file, { readOnly: true });
  let rows: MessageRow[];
  try {
    const statement = db.prepare(sql);
    statement.setReadBigInts(true);
    rows = statement.all(...parameters) as unknown as MessageRow[];
  } finally {
    db.close();
  }
  if (limited) rows.reverse();

  const messages: BackupMessage[] = [];
  for (const row of rows) {
    let text = present(row.text);
    let fromBody = false;
    if (text === undefined && row.body !== null) {
      text = extractTypedstreamText(row.body);
      fromBody = text !== undefined;
    }
    if (text === undefined) continue;
    const handle = present(row.handle);
    const service = present(row.service);
    const chatId = present(row.chat_id);
    const chatName = present(row.chat_name);
    messages.push({
      guid: row.guid,
      date: appleDateToIso(row.date),
      text,
      is_from_me: Number(row.is_from_me ?? 0) === 1,
      ...(handle === undefined ? {} : { handle }),
      ...(service === undefined ? {} : { service }),
      ...(chatId === undefined ? {} : { chat_id: chatId }),
      ...(chatName === undefined ? {} : { chat_name: chatName }),
      ...(fromBody ? { from_attributed_body: true } : {}),
    });
  }
  return messages;
}

/**
 * This function reads the messages of a backup folder, in time order. It copies `sms.db` to a
 * temporary folder, reads the copy and deletes it. It changes nothing in the backup.
 */
export async function readMessages(backup: string, query: MessageQuery = {}): Promise<BackupMessage[]> {
  const file = await findBackupFile(backup, SMS_DOMAIN, SMS_RELATIVE_PATH);
  if (file === undefined) throw new IosBackupError("no-file", `The backup has no messages database (${SMS_RELATIVE_PATH})`);
  return withScratch(async (scratch) => {
    const copy = join(scratch, "sms.db");
    await copyFile(file.path, copy);
    return readSmsDatabase(copy, query);
  });
}
