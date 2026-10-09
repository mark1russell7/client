/**
 * Collect the output of a stream as bytes, with a limit.
 *
 * The collector decodes the bytes once at the end, so a multibyte character split across two
 * chunks stays whole (BUGS-2026-07 L4). Past the limit, it keeps the first bytes ("head") or the
 * last bytes ("tail"), so a program that prints without end cannot fill the memory.
 */

/** The default limit of each output stream. */
export const DEFAULT_MAX_OUTPUT_BYTES: number = 64 * 1024 * 1024;

export class OutputCollector {
  private chunks: Buffer[] = [];
  private bytes = 0;
  truncated = false;

  constructor(
    private readonly limit: number = DEFAULT_MAX_OUTPUT_BYTES,
    private readonly keep: "head" | "tail" = "head",
  ) {}

  add(chunk: Buffer): void {
    if (this.keep === "head") {
      const room = this.limit - this.bytes;
      if (room <= 0) {
        this.truncated = true;
        return;
      }
      const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
      if (kept.length < chunk.length) this.truncated = true;
      this.chunks.push(kept);
      this.bytes += kept.length;
      return;
    }
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    // Drop whole chunks from the start while the rest is above the limit, then cut the first one
    while (this.bytes > this.limit && this.chunks.length > 0) {
      const first = this.chunks[0]!;
      const excess = this.bytes - this.limit;
      this.truncated = true;
      if (first.length <= excess) {
        this.chunks.shift();
        this.bytes -= first.length;
      } else {
        this.chunks[0] = first.subarray(excess);
        this.bytes -= excess;
      }
    }
  }

  /** The collected bytes. */
  buffer(): Buffer {
    let data = Buffer.concat(this.chunks);
    // A cut tail can start inside a UTF-8 character: drop its continuation bytes
    if (this.keep === "tail" && this.truncated) {
      let start = 0;
      while (start < data.length && start < 4 && (data[start]! & 0xc0) === 0x80) start++;
      data = data.subarray(start);
    }
    return data;
  }

  text(encoding: BufferEncoding = "utf8"): string {
    return this.buffer().toString(encoding);
  }
}
