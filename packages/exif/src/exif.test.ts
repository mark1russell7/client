import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { readExif } from "./exif.js";
import { exifProcedures } from "./procedures.js";

/**
 * A JPEG with a made-up EXIF block (little-endian TIFF): a time, an offset and a GPS position of
 * 12.5 N, 45.26 W.
 */
function jpegWithExif(options: { offset?: boolean; gps?: boolean } = {}): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(200));
  const le = true;
  const text = (at: number, value: string): void => {
    for (let i = 0; i < value.length; i += 1) tiff.setUint8(at + i, value.charCodeAt(i));
  };
  const entry = (at: number, tag: number, type: number, count: number, value: number): void => {
    tiff.setUint16(at, tag, le);
    tiff.setUint16(at + 2, type, le);
    tiff.setUint32(at + 4, count, le);
    tiff.setUint32(at + 8, value, le);
  };
  const rationals = (at: number, values: Array<[number, number]>): void =>
    values.forEach(([numerator, denominator], i) => {
      tiff.setUint32(at + i * 8, numerator, le);
      tiff.setUint32(at + i * 8 + 4, denominator, le);
    });
  text(0, "II");
  tiff.setUint16(2, 42, le);
  tiff.setUint32(4, 8, le);
  // IFD0 at 8: the EXIF pointer and the GPS pointer
  tiff.setUint16(8, options.gps === false ? 1 : 2, le);
  entry(10, 0x8769, 4, 1, 38);
  if (options.gps !== false) entry(22, 0x8825, 4, 1, 96);
  // EXIF IFD at 38: DateTimeOriginal (data at 68) and OffsetTimeOriginal (data at 88)
  tiff.setUint16(38, options.offset === false ? 1 : 2, le);
  entry(40, 0x9003, 2, 20, 68);
  if (options.offset !== false) entry(52, 0x9011, 2, 7, 88);
  text(68, "2001:02:03 04:05:06\0");
  text(88, "+01:00\0");
  // GPS IFD at 96: N, latitude (data at 150), W, longitude (data at 174)
  tiff.setUint16(96, 4, le);
  entry(98, 1, 2, 2, 0);
  text(106, "N\0");
  entry(110, 2, 5, 3, 150);
  entry(122, 3, 2, 2, 0);
  text(130, "W\0");
  entry(134, 4, 5, 3, 174);
  rationals(150, [
    [12, 1],
    [30, 1],
    [0, 1],
  ]);
  rationals(174, [
    [45, 1],
    [15, 1],
    [36, 1],
  ]);
  const body = new Uint8Array(tiff.buffer);
  const segment = 2 + 6 + body.length;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, segment >> 8, segment & 0xff, ...Array.from("Exif\0\0", (c) => c.charCodeAt(0)), ...body, 0xff, 0xda, 0, 2]);
}

describe("readExif", () => {
  it("reads the time with its offset, and the position", () => {
    expect(readExif(jpegWithExif())).toEqual({ takenAt: "2001-02-03T04:05:06+01:00", lat: 12.5, lon: -45.26 });
  });

  it("reads the time without an offset, and a photo without a position", () => {
    expect(readExif(jpegWithExif({ offset: false, gps: false }))).toEqual({ takenAt: "2001-02-03T04:05:06" });
  });

  it("gives nothing for a JPEG without EXIF, and for a file that is not a JPEG", () => {
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toEqual({});
    expect(readExif(new TextEncoder().encode("not an image"))).toEqual({});
  });

  it("gives nothing for a truncated EXIF block", () => {
    expect(readExif(jpegWithExif().subarray(0, 40))).toEqual({});
  });
});

describe("exif.read", () => {
  let dir: string | undefined;
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("reads a photo file", async () => {
    dir = await mkdtemp(join(tmpdir(), "exif-"));
    const path = join(dir, "photo.jpg");
    await writeFile(path, jpegWithExif());
    const registry = new ProcedureRegistry();
    for (const procedure of exifProcedures) registry.register(procedure);
    const output = await outputValue(await invokePath(["exif", "read"], { path }, { registry }), ["exif", "read"]);
    expect(output).toEqual({ takenAt: "2001-02-03T04:05:06+01:00", lat: 12.5, lon: -45.26 });
  });
});
