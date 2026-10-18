import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue, type AnyProcedure } from "@procedures/client";
import {
  APPLE_EPOCH_MS,
  IosBackupError,
  SMS_DOMAIN,
  SMS_RELATIVE_PATH,
  appleDateToIso,
  defaultBackupRoots,
  extractTypedstreamText,
  findBackupFile,
  findLatestBackup,
  isoToAppleDate,
  listBackups,
  readMessages,
  readSmsDatabase,
} from "./backup.js";
import { iosBackupModule, registerIosBackupProcedures } from "./module.js";
import { iosBackupProcedures } from "./procedures.js";

// All the data of these tests is made up: 555-01xx numbers, example.com addresses, made-up times.

const temps: string[] = [];
afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "ios-backup-test-"));
  temps.push(dir);
  return dir;
};

/** An Apple time in nanoseconds. */
const ns = (iso: string): bigint => BigInt(Date.parse(iso) - APPLE_EPOCH_MS) * 1_000_000n;
/** An Apple time in seconds (the unit of older databases). */
const seconds = (iso: string): number => (Date.parse(iso) - APPLE_EPOCH_MS) / 1000;

/** A typedstream `attributedBody` with the text, in the layout of the Messages app. */
function typedstream(text: string, className = "NSString"): Uint8Array {
  const utf8 = Buffer.from(text, "utf8");
  const n = utf8.length;
  const length =
    n < 0x80 ? [n] : n < 0x10000 ? [0x81, n & 0xff, n >> 8] : [0x82, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24];
  return Buffer.concat([
    Buffer.from("\x04\x0bstreamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92\x84\x84\x84\x08", "latin1"),
    Buffer.from(className, "latin1"),
    Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b, ...length]),
    utf8,
    Buffer.from([0x86, 0x84, 0x02, 0x69, 0x49]),
  ]);
}

const fileIdOf = (domain: string, relativePath: string): string => createHash("sha1").update(`${domain}-${relativePath}`).digest("hex");

interface MessageFixture {
  guid: string | null;
  text?: string | null;
  body?: Uint8Array | null;
  date: bigint | number;
  fromMe?: boolean;
  handle?: number | null;
  service?: string | null;
  chats?: number[];
}

/** This function writes a messages database with two handles, two chats and the messages. */
function writeSmsDb(path: string, messages: MessageFixture[]): void {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, text TEXT, attributedBody BLOB,
      date INTEGER, is_from_me INTEGER DEFAULT 0, handle_id INTEGER DEFAULT 0, service TEXT);
    CREATE TABLE handle (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, service TEXT);
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, chat_identifier TEXT, display_name TEXT);
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
    INSERT INTO handle (ROWID, id, service) VALUES (1, '+15555550100', 'iMessage'), (2, 'someone@example.com', 'iMessage');
    INSERT INTO chat (ROWID, chat_identifier, display_name) VALUES (1, '+15555550100', ''), (2, 'chat000000000000000001', 'Test group');
  `);
  const insert = db.prepare("INSERT INTO message (guid, text, attributedBody, date, is_from_me, handle_id, service) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const join = db.prepare("INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)");
  for (const m of messages) {
    const { lastInsertRowid } = insert.run(m.guid, m.text ?? null, m.body ?? null, m.date, m.fromMe === true ? 1 : 0, m.handle ?? null, m.service ?? null);
    for (const chat of m.chats ?? []) join.run(chat, lastInsertRowid);
  }
  db.close();
}

const MESSAGES: MessageFixture[] = [
  { guid: "G-1", text: "First test message", date: ns("2030-01-01T10:00:00Z"), handle: 1, service: "iMessage", chats: [1] },
  { guid: "G-2", text: "A reply", date: ns("2030-01-01T10:01:00Z"), fromMe: true, handle: 1, service: "iMessage", chats: [1] },
  { guid: "G-3", body: typedstream("Text from the body"), date: ns("2030-01-02T08:00:00Z"), handle: 2, service: "iMessage", chats: [2] },
  { guid: "G-4", text: "", date: ns("2030-01-02T09:00:00Z"), handle: 2, service: "SMS", chats: [2] },
  { guid: null, text: "No guid", date: ns("2030-01-02T09:30:00Z"), handle: 2 },
  { guid: "G-5", text: "In two chats", date: ns("2030-01-03T12:00:00Z"), handle: 2, service: "SMS", chats: [1, 2] },
  { guid: "G-0", text: "An old message", date: seconds("2029-12-31T23:00:00Z"), handle: null, service: null },
];

interface BackupOptions {
  messages?: MessageFixture[] | false;
  flat?: boolean;
  mtime?: string;
}

/** This function makes a backup folder with a `Manifest.db` and, by default, a messages database. */
async function makeBackup(root: string, name: string, options: BackupOptions = {}): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  const manifest = new DatabaseSync(join(dir, "Manifest.db"));
  manifest.exec("CREATE TABLE Files (fileID TEXT PRIMARY KEY, domain TEXT, relativePath TEXT, flags INTEGER, file BLOB)");
  const smsId = fileIdOf(SMS_DOMAIN, SMS_RELATIVE_PATH);
  if (options.messages !== false) {
    manifest.prepare("INSERT INTO Files VALUES (?, ?, ?, 1, NULL)").run(smsId, SMS_DOMAIN, SMS_RELATIVE_PATH);
    const folder = options.flat === true ? dir : join(dir, smsId.slice(0, 2));
    await mkdir(folder, { recursive: true });
    writeSmsDb(join(folder, smsId), options.messages ?? MESSAGES);
  }
  manifest.prepare("INSERT INTO Files VALUES (?, ?, ?, 1, NULL)").run(fileIdOf("MediaDomain", "Library/Missing.txt"), "MediaDomain", "Library/Missing.txt");
  manifest.close();
  if (options.mtime !== undefined) {
    const time = new Date(options.mtime);
    await utimes(join(dir, "Manifest.db"), time, time);
  }
  return dir;
}

describe("appleDateToIso and isoToAppleDate", () => {
  it("reads nanoseconds and seconds, as numbers and as bigints", () => {
    const iso = "2030-05-06T07:08:09Z";
    expect(appleDateToIso(ns(iso))).toBe(iso);
    expect(appleDateToIso(Number(ns(iso)))).toBe(iso);
    expect(appleDateToIso(seconds(iso))).toBe(iso);
    expect(appleDateToIso(BigInt(seconds(iso)))).toBe(iso);
    expect(appleDateToIso(0)).toBe("2001-01-01T00:00:00Z");
  });

  it("gives nanoseconds, and refuses a value that is not a time", () => {
    expect(isoToAppleDate("2001-01-01T00:00:01Z")).toBe(1_000_000_000n);
    expect(appleDateToIso(isoToAppleDate("2030-05-06T07:08:09.500Z"))).toBe("2030-05-06T07:08:09Z");
    expect(() => isoToAppleDate("yesterday")).toThrow(RangeError);
  });
});

describe("extractTypedstreamText", () => {
  it("reads a short text, a text of 2 length bytes and a text of 4 length bytes", () => {
    expect(extractTypedstreamText(typedstream("Hello there"))).toBe("Hello there");
    const long = "x".repeat(300);
    expect(extractTypedstreamText(typedstream(long))).toBe(long);
    const body = Buffer.from(typedstream("y".repeat(70_000)));
    expect(extractTypedstreamText(body)).toHaveLength(70_000);
  });

  it("keeps a UTF-8 text that holds the byte 0x86", () => {
    // "Ć" is C4 86 in UTF-8: the length, not the end byte, gives the end of the text
    expect(extractTypedstreamText(typedstream("Ćao, café ☕"))).toBe("Ćao, café ☕");
  });

  it("reads NSMutableString, and a view into a larger buffer", () => {
    expect(extractTypedstreamText(typedstream("Mutable", "NSMutableString"))).toBe("Mutable");
    const inner = typedstream("Inner text");
    const outer = new Uint8Array(inner.length + 10);
    outer.set(inner, 5);
    expect(extractTypedstreamText(outer.subarray(5, 5 + inner.length))).toBe("Inner text");
  });

  it("reads to the end byte when the length does not agree with the value", () => {
    const fallback = Buffer.concat([Buffer.from("NSString+", "latin1"), Buffer.from([0x83]), Buffer.from("until end"), Buffer.from([0x86, 0x41])]);
    expect(extractTypedstreamText(fallback)).toBe("until end");
    const tooLong = Buffer.concat([Buffer.from("NSString+", "latin1"), Buffer.from([0x7f]), Buffer.from("short")]);
    expect(extractTypedstreamText(tooLong)).toBe("short");
    const shortLength = Buffer.concat([Buffer.from("NSString+", "latin1"), Buffer.from([0x81, 0x05])]);
    expect(extractTypedstreamText(shortLength)).toBeUndefined();
    const shortLength4 = Buffer.concat([Buffer.from("NSString+", "latin1"), Buffer.from([0x82, 0x05, 0x00])]);
    expect(extractTypedstreamText(shortLength4)).toBeUndefined();
  });

  it("gives undefined without a string, without its start, and for an empty text", () => {
    expect(extractTypedstreamText(Buffer.from("no class name here"))).toBeUndefined();
    expect(extractTypedstreamText(Buffer.from("NSString without a plus"))).toBeUndefined();
    expect(extractTypedstreamText(Buffer.from("NSString+"))).toBeUndefined();
    expect(extractTypedstreamText(typedstream("   "))).toBeUndefined();
  });
});

describe("defaultBackupRoots", () => {
  it("gives the folders of Windows and macOS in the home folder", () => {
    expect(defaultBackupRoots("/home/test")).toEqual([
      join("/home/test", "Apple", "MobileSync", "Backup"),
      join("/home/test", "AppData", "Roaming", "Apple Computer", "MobileSync", "Backup"),
      join("/home/test", "Library", "Application Support", "MobileSync", "Backup"),
    ]);
    expect(defaultBackupRoots()).toHaveLength(3);
  });
});

describe("listBackups and findLatestBackup", () => {
  it("lists the folders with a Manifest.db, the newest first, in all the roots", async () => {
    const a = await tempDir();
    const b = await tempDir();
    const older = await makeBackup(a, "00000000-0000000000000001", { messages: false, mtime: "2030-01-01T00:00:00Z" });
    const newer = await makeBackup(b, "00000000-0000000000000002", { messages: false, mtime: "2030-02-01T00:00:00Z" });
    await mkdir(join(a, "not-a-backup"));
    await writeFile(join(a, "a-file.txt"), "x");
    const backups = await listBackups([join(a, "missing"), a, b]);
    expect(backups.map((backup) => backup.path)).toEqual([newer, older]);
    expect(backups[0]?.modifiedAt).toBe("2030-02-01T00:00:00.000Z");
    expect(await findLatestBackup([a, b])).toBe(newer);
  });

  it("gives no backup for empty or missing roots", async () => {
    const empty = await tempDir();
    expect(await listBackups([empty, join(empty, "missing")])).toEqual([]);
    expect(await findLatestBackup([empty])).toBeUndefined();
  });
});

describe("findBackupFile", () => {
  it("finds a file in its subfolder or at the top of the backup", async () => {
    const root = await tempDir();
    const sharded = await makeBackup(root, "sharded");
    const flat = await makeBackup(root, "flat", { flat: true });
    const id = fileIdOf(SMS_DOMAIN, SMS_RELATIVE_PATH);
    expect(await findBackupFile(sharded, SMS_DOMAIN, SMS_RELATIVE_PATH)).toEqual({ fileId: id, path: join(sharded, id.slice(0, 2), id) });
    expect(await findBackupFile(flat, SMS_DOMAIN, SMS_RELATIVE_PATH)).toEqual({ fileId: id, path: join(flat, id) });
  });

  it("refuses a file name of Manifest.db that is not a hash, so it cannot leave the backup folder", async () => {
    const backup = await makeBackup(await tempDir(), "backup");
    const manifest = new DatabaseSync(join(backup, "Manifest.db"));
    manifest.prepare("INSERT INTO Files VALUES (?, ?, ?, 1, NULL)").run("../../outside", "HomeDomain", "Library/Evil.db");
    manifest.close();
    await expect(findBackupFile(backup, "HomeDomain", "Library/Evil.db")).rejects.toMatchObject({ code: "invalid-file-id" });
  });

  it("gives undefined for a file that Manifest.db does not list", async () => {
    const backup = await makeBackup(await tempDir(), "backup");
    expect(await findBackupFile(backup, "HomeDomain", "Library/Nothing.db")).toBeUndefined();
  });

  it("throws an IosBackupError with a code for each problem", async () => {
    const root = await tempDir();
    const backup = await makeBackup(root, "backup");
    await expect(findBackupFile(backup, "MediaDomain", "Library/Missing.txt")).rejects.toMatchObject({ code: "missing-file" });
    await expect(findBackupFile(join(root, "nothing"), SMS_DOMAIN, SMS_RELATIVE_PATH)).rejects.toMatchObject({ code: "no-backup" });
    const encrypted = join(root, "encrypted");
    await mkdir(encrypted);
    await writeFile(join(encrypted, "Manifest.db"), Buffer.alloc(4096, 0xa5));
    const error = await findBackupFile(encrypted, SMS_DOMAIN, SMS_RELATIVE_PATH).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IosBackupError);
    expect(error).toMatchObject({ name: "IosBackupError", code: "encrypted" });
  });
});

describe("readMessages and readSmsDatabase", () => {
  it("reads the messages in time order, with the text of attributedBody and both time units", async () => {
    const backup = await makeBackup(await tempDir(), "backup");
    const messages = await readMessages(backup);
    expect(messages).toEqual([
      { guid: "G-0", date: "2029-12-31T23:00:00Z", text: "An old message", is_from_me: false },
      {
        guid: "G-1",
        date: "2030-01-01T10:00:00Z",
        text: "First test message",
        is_from_me: false,
        handle: "+15555550100",
        service: "iMessage",
        chat_id: "+15555550100",
      },
      { guid: "G-2", date: "2030-01-01T10:01:00Z", text: "A reply", is_from_me: true, handle: "+15555550100", service: "iMessage", chat_id: "+15555550100" },
      {
        guid: "G-3",
        date: "2030-01-02T08:00:00Z",
        text: "Text from the body",
        is_from_me: false,
        handle: "someone@example.com",
        service: "iMessage",
        chat_id: "chat000000000000000001",
        chat_name: "Test group",
        from_attributed_body: true,
      },
      { guid: "G-5", date: "2030-01-03T12:00:00Z", text: "In two chats", is_from_me: false, handle: "someone@example.com", service: "SMS", chat_id: "+15555550100" },
    ]);
  });

  it("filters by time, and keeps the newest messages for a limit", async () => {
    const backup = await makeBackup(await tempDir(), "backup");
    const guids = async (query: Parameters<typeof readMessages>[1]): Promise<string[]> => (await readMessages(backup, query)).map((m) => m.guid);
    expect(await guids({ since: "2030-01-01T10:01:00Z" })).toEqual(["G-2", "G-3", "G-5"]);
    expect(await guids({ until: "2030-01-01T10:01:00Z" })).toEqual(["G-0", "G-1"]);
    expect(await guids({ since: "2029-12-31T00:00:00Z", until: "2030-01-01T00:00:00Z" })).toEqual(["G-0"]);
    expect(await guids({ limit: 2 })).toEqual(["G-3", "G-5"]);
    expect(await guids({ limit: 0 })).toEqual([]);
  });

  it("reads a messages database file directly", async () => {
    const file = join(await tempDir(), "chat.db");
    writeSmsDb(file, [{ guid: "G-9", text: "Direct", date: ns("2030-03-03T03:03:03Z"), fromMe: true, chats: [2] }]);
    expect(await readSmsDatabase(file)).toEqual([
      { guid: "G-9", date: "2030-03-03T03:03:03Z", text: "Direct", is_from_me: true, chat_id: "chat000000000000000001", chat_name: "Test group" },
    ]);
  });

  it("throws no-file for a backup without a messages database", async () => {
    const backup = await makeBackup(await tempDir(), "backup", { messages: false });
    await expect(readMessages(backup)).rejects.toMatchObject({ code: "no-file" });
  });
});

describe("the procedures", () => {
  const registry = new ProcedureRegistry();
  registerIosBackupProcedures(registry);
  const call = async (name: string, input: unknown): Promise<unknown> =>
    outputValue(await invokePath(["iosBackup", name], input, { registry }), ["iosBackup", name]);

  it("declare that they read files and change nothing", () => {
    expect(iosBackupModule.procedures).toHaveLength(3);
    for (const procedure of iosBackupProcedures as AnyProcedure[]) {
      expect(procedure.metadata.effects).toEqual({ reads: ["fs"], writes: [] });
    }
    expect(registry.getAll().map((p) => p.path.join("."))).toEqual(["iosBackup.find", "iosBackup.file", "iosBackup.messages"]);
  });

  it("iosBackup.find lists the backups of the roots", async () => {
    const root = await tempDir();
    const backup = await makeBackup(root, "backup", { messages: false, mtime: "2030-04-04T00:00:00Z" });
    expect(await call("find", { roots: [root] })).toEqual({
      latest: { path: backup, modifiedAt: "2030-04-04T00:00:00.000Z" },
      backups: [{ path: backup, modifiedAt: "2030-04-04T00:00:00.000Z" }],
      roots: [root],
    });
    const empty = await tempDir();
    expect(await call("find", { roots: [empty] })).toEqual({ backups: [], roots: [empty] });
    expect(((await call("find", {})) as { roots: string[] }).roots).toEqual(defaultBackupRoots());
  });

  it("iosBackup.file finds a file in the newest backup or in the given backup", async () => {
    const root = await tempDir();
    const backup = await makeBackup(root, "backup");
    const id = fileIdOf(SMS_DOMAIN, SMS_RELATIVE_PATH);
    expect(await call("file", { roots: [root], domain: SMS_DOMAIN, relativePath: SMS_RELATIVE_PATH })).toEqual({
      backup,
      found: true,
      fileId: id,
      path: join(backup, id.slice(0, 2), id),
    });
    expect(await call("file", { backup, domain: "HomeDomain", relativePath: "Library/Nothing.db" })).toEqual({ backup, found: false });
  });

  it("iosBackup.messages reads the messages with the filters", async () => {
    const root = await tempDir();
    const backup = await makeBackup(root, "backup");
    const output = (await call("messages", { roots: [root], since: "2030-01-02T00:00:00Z", limit: 1 })) as { backup: string; messages: Array<{ guid: string }> };
    expect(output.backup).toBe(backup);
    expect(output.messages.map((m) => m.guid)).toEqual(["G-5"]);
  });

  it("refuse a call without a backup, and a time that is not a time", async () => {
    const empty = await tempDir();
    await expect(call("messages", { roots: [empty] })).rejects.toThrow(/No iPhone backup/);
    await expect(call("messages", { roots: [empty], since: "soon" })).rejects.toThrow();
  });
});
