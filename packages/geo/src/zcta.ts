/**
 * The approximate point of a US ZIP code, with no request that names the ZIP code.
 * The caller downloads the national ZCTA file of the Census Gazetteer one time. Then these functions find the point on the computer of the caller.
 * A ZCTA (ZIP Code Tabulation Area) is the area of the Census Bureau that has the blocks of one ZIP code. Its point is the internal point of the area.
 * The functions are pure and use no network, so a browser bundle can use them.
 */
import type { LatLon } from "@mark1russell7/geo";

/** The source of the ZCTA Gazetteer files. The files are public domain. */
export const ZCTA_GAZETTEER_ATTRIBUTION = "U.S. Census Bureau, Gazetteer Files (public domain).";

/** The first year of a national ZCTA file at the URL of `zctaGazetteerUrl`. */
export const FIRST_ZCTA_GAZETTEER_YEAR = 2012;

/**
 * This function gives the URL of the national ZCTA file of the Census Gazetteer for a year.
 * The file is a ZIP archive with one text file, approximately 1 MB. The years 2012 and later use this URL pattern.
 * A year before 2012 or a year that is not a whole number gives a `RangeError`. A future year gives a URL with no file.
 */
export function zctaGazetteerUrl(year: number): string {
  if (!Number.isInteger(year) || year < FIRST_ZCTA_GAZETTEER_YEAR) throw new RangeError(`The year is not a whole number from ${FIRST_ZCTA_GAZETTEER_YEAR}`);
  return `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${year}_Gazetteer/${year}_Gaz_zcta_national.zip`;
}

/** One ZCTA of the Gazetteer file. */
export interface ZctaCenter {
  /** The 5 digits of the ZCTA, the column `GEOID`. */
  readonly zcta: string;
  /** The internal point of the area, the columns `INTPTLAT` and `INTPTLONG`. */
  readonly point: LatLon;
  /** The land area, in square metres, the column `ALAND`. */
  readonly landM2: number;
}

/** The columns that `parseZctaGazetteer` reads. A file can have more columns. */
const ZCTA_COLUMNS = ["GEOID", "ALAND", "INTPTLAT", "INTPTLONG"] as const;

/** Five digits: a ZCTA, or the first part of a ZIP code. */
const FIVE_DIGITS = /^\d{5}$/;

/**
 * This function reads the text of a national ZCTA file of the Census Gazetteer. The separator is a tab.
 * It finds the columns by the names of the first line, and ignores the spaces around each name and value.
 * A text with no column `GEOID`, `ALAND`, `INTPTLAT` or `INTPTLONG` gives an `Error`. A row with a bad value gives an `Error` with its line number.
 * The function skips the empty lines.
 */
export function parseZctaGazetteer(text: string): ZctaCenter[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = (lines[0] ?? "").split("\t").map((name) => name.trim());
  const missing = ZCTA_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length > 0) throw new Error(`The text is not a ZCTA Gazetteer file: it has no column ${missing.join(", ")}`);
  const [geoid, aland, lat, lon] = ZCTA_COLUMNS.map((name) => header.indexOf(name)) as [number, number, number, number];
  const centers: ZctaCenter[] = [];
  lines.forEach((line, index) => {
    if (index === 0 || line.trim() === "") return;
    const cells = line.split("\t").map((cell) => cell.trim());
    const zcta = cells[geoid] ?? "";
    const point = { lat: numberOf(cells[lat]), lon: numberOf(cells[lon]) };
    const landM2 = numberOf(cells[aland]);
    const valid =
      FIVE_DIGITS.test(zcta) &&
      Math.abs(point.lat) <= 90 &&
      Math.abs(point.lon) <= 180 &&
      Number.isFinite(landM2) &&
      landM2 >= 0;
    if (!valid) throw new Error(`Line ${index + 1} of the ZCTA Gazetteer file has a bad ZCTA, point or land area`);
    centers.push({ zcta, point, landM2 });
  });
  return centers;
}

/** This function gives the number of a cell, or `NaN` for a cell that is empty or absent. */
function numberOf(cell: string | undefined): number {
  return cell === undefined || cell === "" ? Number.NaN : Number(cell);
}

/**
 * This function gives the 5 digits of a US ZIP code. It accepts `12345` and `12345-6789`, with spaces around them.
 * A different text gives `undefined`.
 */
export function zip5(zip: string): string | undefined {
  const text = zip.trim();
  const five = text.slice(0, 5);
  if (!FIVE_DIGITS.test(five)) return undefined;
  const rest = text.slice(5);
  return rest === "" || /^-\d{4}$/.test(rest) ? five : undefined;
}

/** This function gives a map from each ZCTA to its record, for `zipCenter`. A ZCTA that occurs again replaces the first record. */
export function zctaIndex(centers: readonly ZctaCenter[]): ReadonlyMap<string, ZctaCenter> {
  return new Map(centers.map((center) => [center.zcta, center]));
}

/**
 * This function gives the internal point of the ZCTA of a ZIP code, from the map of `zctaIndex`.
 * A text that is not a ZIP code, or a ZIP code with no ZCTA, gives `undefined`. A ZIP code of post office boxes only often has no ZCTA.
 */
export function zipCenter(zip: string, index: ReadonlyMap<string, ZctaCenter>): LatLon | undefined {
  const five = zip5(zip);
  return five === undefined ? undefined : index.get(five)?.point;
}
