/**
 * Zip archives on `node:zlib` (roadmap R46).
 *
 * The package reads and writes zip itself, for two reasons. The reader needs the external
 * attributes of each entry, to see a symbolic link, and a limit on the bytes of each entry
 * against a zip bomb. A zip library that decodes in memory gives neither.
 *
 * - The reader takes the central directory: stored and deflated entries, UTF-8 names, and the
 *   zip64 fields. It refuses an encrypted entry, another method and an archive on more disks.
 * - The extract streams each entry and stops when it gets more bytes than the entry declares.
 *   It examines the size and the CRC-32 of each entry.
 * - The writer stores each file, or deflates it when that is smaller. It writes no zip64 fields:
 *   it refuses more than 65535 entries and an archive of 4 GiB or more.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { Readable, Transform, Writable, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw, deflateRawSync } from "node:zlib";
import { ArchiveError } from "./errors.js";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_END64 = 0x06064b50;
const SIG_LOCATOR64 = 0x07064b50;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const OS_UNIX = 3;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
/** The largest central directory that the reader takes. */
const MAX_DIRECTORY_BYTES = 256 * 1024 * 1024;
/** The largest target of a symbolic link. */
const MAX_LINK_BYTES = 4096;

// =============================================================================
// CRC-32
// =============================================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of bytes, continued from `crc` (0 for new bytes). */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

// =============================================================================
// Reading
// =============================================================================

/** One entry of the central directory. */
export interface ZipEntry {
  readonly name: string;
  readonly kind: "file" | "directory" | "symlink";
  readonly method: number;
  readonly flags: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localOffset: number;
  /** The mode bits of a Unix entry, without the type. */
  readonly mode: number | undefined;
  readonly mtime: Date;
}

/** The time of a DOS date and time, as a local time. */
function dosTime(date: number, time: number): Date {
  return new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2);
}

/** The DOS date and time of a time. */
function toDosTime(when: Date): { date: number; time: number } {
  const year = Math.min(Math.max(when.getFullYear(), 1980), 2107);
  return {
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
  };
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** The text of a name: UTF-8 when the bytes are UTF-8, else Latin-1. */
function decodeName(bytes: Buffer, flags: number): string {
  if (flags & FLAG_UTF8) return bytes.toString("utf8");
  try {
    return utf8.decode(bytes);
  } catch {
    return bytes.toString("latin1");
  }
}

/** A 64-bit number that must fit in a safe integer. */
function u64(buffer: Buffer, offset: number): number {
  const value = buffer.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ArchiveError("BAD_ARCHIVE", "The zip has a size or an offset that is too large");
  return Number(value);
}

async function readAt(handle: FileHandle, offset: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, offset);
  if (bytesRead !== length) throw new ArchiveError("BAD_ARCHIVE", "The zip ends before its central directory ends");
  return buffer;
}

/** The place and the size of the central directory, and the number of entries. */
async function findDirectory(handle: FileHandle, fileSize: number): Promise<{ offset: number; size: number; count: number }> {
  const tailLength = Math.min(fileSize, 22 + 65_535);
  const tail = await readAt(handle, fileSize - tailLength, tailLength);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_END) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new ArchiveError("BAD_ARCHIVE", "The file has no end of a zip central directory");
  if (tail.readUInt16LE(at + 4) !== 0 || tail.readUInt16LE(at + 6) !== 0) throw new ArchiveError("BAD_ARCHIVE", "The zip is on more than one disk");
  let count = tail.readUInt16LE(at + 10);
  let size = tail.readUInt32LE(at + 12);
  let offset = tail.readUInt32LE(at + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locatorAt = fileSize - tailLength + at - 20;
    const locator = locatorAt < 0 ? undefined : await readAt(handle, locatorAt, 20);
    if (locator !== undefined && locator.readUInt32LE(0) === SIG_LOCATOR64) {
      const end64 = await readAt(handle, u64(locator, 8), 56);
      if (end64.readUInt32LE(0) !== SIG_END64) throw new ArchiveError("BAD_ARCHIVE", "The zip64 end of the central directory is missing");
      count = u64(end64, 32);
      size = u64(end64, 40);
      offset = u64(end64, 48);
    } else if (size === 0xffffffff || offset === 0xffffffff) {
      throw new ArchiveError("BAD_ARCHIVE", "The zip64 locator is missing");
    }
    // Without a locator, a count of 0xffff is the true count: a zip of 65535 entries without zip64
  }
  if (offset + size > fileSize) throw new ArchiveError("BAD_ARCHIVE", "The central directory of the zip is out of the file");
  if (size > MAX_DIRECTORY_BYTES) throw new ArchiveError("TOO_LARGE", "The central directory of the zip is too large");
  return { offset, size, count };
}

/** The kind of an entry: from the Unix type of its attributes, from a name with `/`, or from the DOS folder flag. */
function kindOf(name: string, madeBy: number, external: number): ZipEntry["kind"] {
  const unixType = madeBy >> 8 === OS_UNIX ? (external >>> 16) & S_IFMT : 0;
  if (unixType === S_IFLNK) return "symlink";
  if (unixType === S_IFDIR || name.endsWith("/") || name.endsWith("\\") || (external & 0x10) !== 0) return "directory";
  return "file";
}

/** This function reads the central directory of a zip. It throws `TOO_LARGE` for more than `maxEntries` entries. */
export async function readZipDirectory(path: string, maxEntries: number): Promise<ZipEntry[]> {
  const handle = await open(path, "r");
  try {
    const { size: fileSize } = await handle.stat();
    const directory = await findDirectory(handle, fileSize);
    if (directory.count > maxEntries) throw new ArchiveError("TOO_LARGE", `The archive has ${directory.count} entries, more than the limit of ${maxEntries}`);
    const buffer = await readAt(handle, directory.offset, directory.size);
    const entries: ZipEntry[] = [];
    let at = 0;
    for (let index = 0; index < directory.count; index++) {
      if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== SIG_CENTRAL) throw new ArchiveError("BAD_ARCHIVE", "The central directory of the zip is damaged");
      const madeBy = buffer.readUInt16LE(at + 4);
      const flags = buffer.readUInt16LE(at + 8);
      const method = buffer.readUInt16LE(at + 10);
      const time = buffer.readUInt16LE(at + 12);
      const date = buffer.readUInt16LE(at + 14);
      const crc = buffer.readUInt32LE(at + 16);
      let compressedSize = buffer.readUInt32LE(at + 20);
      let size = buffer.readUInt32LE(at + 24);
      const nameLength = buffer.readUInt16LE(at + 28);
      const extraLength = buffer.readUInt16LE(at + 30);
      const commentLength = buffer.readUInt16LE(at + 32);
      const external = buffer.readUInt32LE(at + 38);
      let localOffset = buffer.readUInt32LE(at + 42);
      const nameStart = at + 46;
      const extraStart = nameStart + nameLength;
      const next = extraStart + extraLength + commentLength;
      if (next > buffer.length) throw new ArchiveError("BAD_ARCHIVE", "The central directory of the zip is damaged");
      const name = decodeName(buffer.subarray(nameStart, extraStart), flags);
      // The zip64 field has the values that do not fit in 32 bits, in this order
      if (size === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) {
        let field = extraStart;
        let found = false;
        while (field + 4 <= extraStart + extraLength) {
          const id = buffer.readUInt16LE(field);
          const length = buffer.readUInt16LE(field + 2);
          if (id === 0x0001) {
            let value = field + 4;
            const end = value + length;
            const take = (): number => {
              if (value + 8 > end) throw new ArchiveError("BAD_ARCHIVE", `The zip64 field of ${name} is too short`, name);
              const result = u64(buffer, value);
              value += 8;
              return result;
            };
            if (size === 0xffffffff) size = take();
            if (compressedSize === 0xffffffff) compressedSize = take();
            if (localOffset === 0xffffffff) localOffset = take();
            found = true;
            break;
          }
          field += 4 + length;
        }
        if (!found) throw new ArchiveError("BAD_ARCHIVE", `The entry ${name} has no zip64 field`, name);
      }
      const unixMode = madeBy >> 8 === OS_UNIX ? (external >>> 16) & 0o7777 : 0;
      entries.push({
        name,
        kind: kindOf(name, madeBy, external),
        method,
        flags,
        crc,
        compressedSize,
        size,
        localOffset,
        mode: unixMode === 0 ? undefined : unixMode,
        mtime: dosTime(date, time),
      });
      at = next;
    }
    return entries;
  } finally {
    await handle.close();
  }
}

/** The offset of the data of an entry: after its local header. */
async function localDataOffset(archive: string, entry: ZipEntry): Promise<number> {
  const handle = await open(archive, "r");
  try {
    const header = await readAt(handle, entry.localOffset, 30);
    if (header.readUInt32LE(0) !== SIG_LOCAL) throw new ArchiveError("BAD_ARCHIVE", `The local header of ${entry.name} is damaged`, entry.name);
    return entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally {
    await handle.close();
  }
}

/** This function refuses an entry that the reader does not decode. */
function assertReadable(entry: ZipEntry): void {
  if (entry.flags & FLAG_ENCRYPTED) throw new ArchiveError("BAD_ARCHIVE", `The entry ${entry.name} is encrypted`, entry.name);
  if (entry.method !== METHOD_STORE && entry.method !== METHOD_DEFLATE) {
    throw new ArchiveError("BAD_ARCHIVE", `The entry ${entry.name} uses the compression method ${entry.method}: only store and deflate are supported`, entry.name);
  }
}

/** A stream step that counts the bytes and the CRC-32, and stops at more bytes than the entry declares. */
class EntryCheck extends Transform {
  private bytes = 0;
  private crc = 0;

  constructor(private readonly entry: ZipEntry) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.entry.size) {
      done(new ArchiveError("BAD_ARCHIVE", `The entry ${this.entry.name} has more bytes than its declared size of ${this.entry.size}`, this.entry.name));
      return;
    }
    this.crc = crc32(chunk, this.crc);
    done(null, chunk);
  }

  override _flush(done: TransformCallback): void {
    if (this.bytes !== this.entry.size) {
      done(new ArchiveError("BAD_ARCHIVE", `The entry ${this.entry.name} has ${this.bytes} bytes, not ${this.entry.size}`, this.entry.name));
    } else if (this.crc !== this.entry.crc) {
      done(new ArchiveError("BAD_ARCHIVE", `The CRC-32 of the entry ${this.entry.name} is not correct`, this.entry.name));
    } else {
      done();
    }
  }
}

/**
 * The decoded bytes of an entry, through the checks, into the stream of `open`. The stream opens
 * after the checks of the entry and of its local header: a refused entry makes no file.
 */
async function decodeEntry(archive: string, entry: ZipEntry, open: () => Writable): Promise<void> {
  assertReadable(entry);
  const start = await localDataOffset(archive, entry);
  const destination = open();
  if (entry.compressedSize === 0) {
    await pipeline(Readable.from([]), new EntryCheck(entry), destination);
    return;
  }
  const input = createReadStream(archive, { start, end: start + entry.compressedSize - 1 });
  if (entry.method === METHOD_DEFLATE) {
    await pipeline(input, createInflateRaw(), new EntryCheck(entry), destination);
  } else {
    await pipeline(input, new EntryCheck(entry), destination);
  }
}

/**
 * This function writes the content of a file entry to `destination`, with the checks. The file
 * must not exist: the caller removes an old file first, so the write never follows a link.
 */
export async function extractZipFile(archive: string, entry: ZipEntry, destination: string, mode?: number): Promise<void> {
  await decodeEntry(archive, entry, () => createWriteStream(destination, { flags: "wx", ...(mode !== undefined ? { mode } : {}) }));
}

/** This function gives the target of a symbolic link entry: its content, as text. */
export async function readZipLink(archive: string, entry: ZipEntry): Promise<string> {
  if (entry.size > MAX_LINK_BYTES) throw new ArchiveError("BAD_ARCHIVE", `The link ${entry.name} has a target of more than ${MAX_LINK_BYTES} bytes`, entry.name);
  const chunks: Buffer[] = [];
  const collect = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk);
      done();
    },
  });
  await decodeEntry(archive, entry, () => collect);
  return Buffer.concat(chunks).toString("utf8");
}

// =============================================================================
// Writing
// =============================================================================

/** One entry for the writer. */
export interface ZipWriteEntry {
  /** The name in the archive. A folder ends with `/`: the writer adds it. */
  readonly name: string;
  readonly kind: "file" | "directory" | "symlink";
  /** The content of a file, or the target of a link as UTF-8. A function loads it when the writer needs it. */
  readonly data?: Uint8Array | (() => Promise<Uint8Array>) | undefined;
  /** The mode bits, without the type. */
  readonly mode?: number | undefined;
  readonly mtime?: Date | undefined;
}

/**
 * This function writes a zip to an open file. The names are not examined here: `archive.create`
 * gives only the relative paths of a walk, and a test gives hostile names on purpose.
 */
export async function writeZip(handle: FileHandle, entries: readonly ZipWriteEntry[]): Promise<number> {
  if (entries.length > 0xffff) throw new ArchiveError("TOO_LARGE", "A zip without zip64 has at most 65535 entries");
  const central: Buffer[] = [];
  let offset = 0;
  const write = async (buffer: Buffer): Promise<void> => {
    if (offset + buffer.length >= 0xffffffff) throw new ArchiveError("TOO_LARGE", "A zip without zip64 must be smaller than 4 GiB");
    await handle.write(buffer, 0, buffer.length, offset);
    offset += buffer.length;
  };
  for (const entry of entries) {
    const name = Buffer.from(entry.kind === "directory" && !entry.name.endsWith("/") ? `${entry.name}/` : entry.name, "utf8");
    const raw = Buffer.from(typeof entry.data === "function" ? await entry.data() : (entry.data ?? new Uint8Array(0)));
    const crc = crc32(raw);
    let method = METHOD_STORE;
    let stored = raw;
    if (entry.kind === "file" && raw.length > 0) {
      const deflated = deflateRawSync(raw);
      if (deflated.length < raw.length) {
        method = METHOD_DEFLATE;
        stored = deflated;
      }
    }
    const { date, time } = toDosTime(entry.mtime ?? new Date());
    const type = entry.kind === "symlink" ? S_IFLNK : entry.kind === "directory" ? S_IFDIR : S_IFREG;
    const mode = entry.mode ?? (entry.kind === "directory" ? 0o755 : entry.kind === "symlink" ? 0o777 : 0o644);
    const external = (((type | (mode & 0o7777)) << 16) | (entry.kind === "directory" ? 0x10 : 0)) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const localOffset = offset;
    await write(Buffer.concat([local, name]));
    if (stored.length > 0) await write(stored);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(SIG_CENTRAL, 0);
    record.writeUInt16LE((OS_UNIX << 8) | 20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(FLAG_UTF8, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt16LE(time, 12);
    record.writeUInt16LE(date, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(stored.length, 20);
    record.writeUInt32LE(raw.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(external, 38);
    record.writeUInt32LE(localOffset, 42);
    central.push(record, name);
  }
  const directory = Buffer.concat(central);
  const directoryOffset = offset;
  await write(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_END, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(directoryOffset, 16);
  await write(end);
  return offset;
}
