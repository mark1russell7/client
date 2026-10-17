/**
 * The sequence numbers of the stream frames (wire protocol v1, `documentation/WIRE-PROTOCOL.md`).
 *
 * - The callee writes `seq` in each `stream` frame of a call: 1 in the first frame, and one more
 *   in each next frame. The end frame has a number too. An NDJSON line `item` or `done` has the
 *   same field.
 * - The caller drops a frame whose `seq` is not above the last one. Thus a duplicate frame or a
 *   late frame gives no item.
 * - A gap is a loss. The delivery is at most once, so the stream continues. The next item has the
 *   number of lost frames in its metadata key `stream-gap`, and the caller writes a warning. The
 *   caller also gives back the credit of the lost frames.
 * - A frame without `seq` comes from an older peer. The caller takes it as before.
 */

/**
 * The metadata key of a stream item after a gap: the number of frames that did not arrive
 * immediately before this item. The receiver sets it. It does not cross the wire.
 */
export const STREAM_GAP_METADATA_KEY = "stream-gap";

/** The order of the stream frames of one call, at the side that receives them. */
export class StreamSequence {
  private last = 0;

  /**
   * This function examines the `seq` of a frame. It gives -1 for a frame to drop: its `seq` is
   * not above the last one. Else it gives the number of frames that did not arrive before this
   * frame. A frame without a valid `seq` gives 0.
   */
  next(seq: unknown, id: string): number {
    if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1) return 0;
    if (seq <= this.last) return -1;
    const gap = seq - this.last - 1;
    this.last = seq;
    if (gap > 0) console.warn(`[stream] Frames lost before seq ${seq} of the call ${id}: ${gap}`);
    return gap;
  }
}

/**
 * This function gives the metadata of a stream item. The key `stream-gap` has the gap of the
 * receiver only: the receiver removes a key of the same name that the peer sent.
 */
export function itemMetadata(metadata: Record<string, unknown> | undefined, gap: number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...metadata };
  delete out[STREAM_GAP_METADATA_KEY];
  if (gap > 0) out[STREAM_GAP_METADATA_KEY] = gap;
  return out;
}

/** The number of frames that did not arrive immediately before an item: 0 without a gap. */
export function gapOf(metadata: Record<string, unknown> | undefined): number {
  const gap = metadata?.[STREAM_GAP_METADATA_KEY];
  return typeof gap === "number" ? gap : 0;
}
