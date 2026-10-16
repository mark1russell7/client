/**
 * When and where a photo was taken, from the EXIF block of a JPEG: the time of the shutter
 * (DateTimeOriginal, with OffsetTimeOriginal when the camera writes it) and the GPS position. It
 * reads these facts only, without a dependency. A JPEG without EXIF (a screenshot, an edited
 * copy) gives no facts.
 */

export interface PhotoFacts {
  /** `YYYY-MM-DDTHH:MM:SS`, with the offset when the photo has one */
  readonly takenAt?: string | undefined;
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
}

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TYPE_ASCII = 2;
const TYPE_RATIONAL = 5;

/** The TIFF block in the APP1 "Exif" segment of a JPEG. */
const tiffOf = (bytes: Uint8Array): DataView | undefined => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined; // not a JPEG
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1] ?? 0;
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === "Exif") {
      const size = Math.min(length - 8, bytes.length - (at + 10));
      return size > 0 ? new DataView(bytes.buffer, bytes.byteOffset + at + 10, size) : undefined;
    }
    if (marker === 0xda) return undefined; // the image data starts: there is no EXIF
    at += 2 + length;
  }
  return undefined;
};

interface Field {
  readonly type: number;
  readonly count: number;
  readonly at: number;
}

/** This function reads the time and the GPS position of a photo from the bytes of a JPEG. */
export const readExif = (bytes: Uint8Array): PhotoFacts => {
  const tiff = tiffOf(bytes);
  if (tiff === undefined || tiff.byteLength < 8) return {};
  const little = tiff.getUint16(0) === 0x4949;
  const within = (at: number, size: number): boolean => at >= 0 && at + size <= tiff.byteLength;
  const u16 = (at: number): number => (within(at, 2) ? tiff.getUint16(at, little) : 0);
  const u32 = (at: number): number => (within(at, 4) ? tiff.getUint32(at, little) : 0);

  /** The entries of one IFD: tag to type, count and the position of the value or its offset */
  const entries = (offset: number): Map<number, Field> => {
    const out = new Map<number, Field>();
    if (!within(offset, 2)) return out;
    const n = u16(offset);
    for (let i = 0; i < n; i += 1) {
      const entry = offset + 2 + i * 12;
      if (!within(entry, 12)) break;
      out.set(u16(entry), { type: u16(entry + 2), count: u32(entry + 4), at: entry + 8 });
    }
    return out;
  };
  const ascii = (field: Field | undefined): string | undefined => {
    if (field === undefined || field.type !== TYPE_ASCII) return undefined;
    const start = field.count > 4 ? u32(field.at) : field.at;
    if (!within(start, field.count)) return undefined;
    let text = "";
    for (let i = 0; i < field.count; i += 1) {
      const code = tiff.getUint8(start + i);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    return text;
  };
  const rationals = (field: Field | undefined): number[] | undefined => {
    if (field === undefined || field.type !== TYPE_RATIONAL) return undefined;
    const start = u32(field.at);
    if (!within(start, field.count * 8)) return undefined;
    return Array.from({ length: field.count }, (_, i) => {
      const denominator = u32(start + i * 8 + 4);
      return denominator === 0 ? 0 : u32(start + i * 8) / denominator;
    });
  };

  const ifd0 = entries(u32(4));
  const facts: { takenAt?: string; lat?: number; lon?: number } = {};
  const exifPointer = ifd0.get(TAG_EXIF_IFD);
  if (exifPointer !== undefined) {
    const exif = entries(u32(exifPointer.at));
    const original = ascii(exif.get(TAG_DATETIME_ORIGINAL)); // "YYYY:MM:DD HH:MM:SS"
    const offset = ascii(exif.get(TAG_OFFSET_TIME_ORIGINAL)); // "+HH:MM"
    const match = original !== undefined ? /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(original) : null;
    if (match !== null) {
      const zone = offset !== undefined && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "";
      facts.takenAt = `${match[1]}-${match[2]}-${match[3]}T${match[4]}${zone}`;
    }
  }
  const gpsPointer = ifd0.get(TAG_GPS_IFD);
  if (gpsPointer !== undefined) {
    const gps = entries(u32(gpsPointer.at));
    const degrees = (parts: number[] | undefined): number | undefined =>
      parts !== undefined && parts.length === 3 ? (parts[0] ?? 0) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600 : undefined;
    const lat = degrees(rationals(gps.get(2)));
    const lon = degrees(rationals(gps.get(4)));
    // 0, 0 is the value of a camera without a position
    if (lat !== undefined && lon !== undefined && (lat !== 0 || lon !== 0)) {
      facts.lat = Math.round((ascii(gps.get(1)) === "S" ? -lat : lat) * 1e6) / 1e6;
      facts.lon = Math.round((ascii(gps.get(3)) === "W" ? -lon : lon) * 1e6) / 1e6;
    }
  }
  return facts;
};
