import { describe, expect, it } from "vitest";
import { FIRST_ZCTA_GAZETTEER_YEAR, parseZctaGazetteer, zctaGazetteerUrl, zctaIndex, zip5, zipCenter } from "./zcta.js";

// The rows are made up: fictional ZCTAs with points in the ocean near latitude 0 and longitude 0.
const HEADER = "GEOID\tALAND\tAWATER\tALAND_SQMI\tAWATER_SQMI\tINTPTLAT\tINTPTLONG";
/** The header of the newer files ends with spaces, as the real files do. */
const file = (rows: readonly string[], header = `${HEADER}${" ".repeat(40)}`): string => [header, ...rows].join("\n") + "\n";
const ROWS = ["00011\t1000000\t2000\t0.386\t0.001\t0.250000\t-0.500000   ", "00012\t2500000\t0\t0.965\t0\t-0.125\t0.750"];

describe("zctaGazetteerUrl", () => {
  it("gives the URL of the national file of a year", () => {
    expect(zctaGazetteerUrl(2024)).toBe("https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip");
    expect(zctaGazetteerUrl(FIRST_ZCTA_GAZETTEER_YEAR)).toContain("/2012_Gazetteer/2012_Gaz_zcta_national.zip");
  });

  it("refuses a year before 2012 and a year that is not a whole number", () => {
    expect(() => zctaGazetteerUrl(2011)).toThrow(RangeError);
    expect(() => zctaGazetteerUrl(2024.5)).toThrow(RangeError);
    expect(() => zctaGazetteerUrl(Number.NaN)).toThrow(RangeError);
  });
});

describe("parseZctaGazetteer", () => {
  it("reads each row, with the spaces around the names and the values", () => {
    expect(parseZctaGazetteer(file(ROWS))).toEqual([
      { zcta: "00011", point: { lat: 0.25, lon: -0.5 }, landM2: 1_000_000 },
      { zcta: "00012", point: { lat: -0.125, lon: 0.75 }, landM2: 2_500_000 },
    ]);
  });

  it("reads the older form: CRLF line ends, values with spaces before them, more columns, and a byte order mark", () => {
    const header = "﻿GEOID\tPOP10\tHU10\tALAND\tAWATER\tALAND_SQMI\tAWATER_SQMI\tINTPTLAT\tINTPTLONG   ";
    const text = [header, "00021\t10\t4\t   500000\t0\t  0.193\t  0\t 0.010000\t -0.020000   ", ""].join("\r\n");
    expect(parseZctaGazetteer(text)).toEqual([{ zcta: "00021", point: { lat: 0.01, lon: -0.02 }, landM2: 500_000 }]);
  });

  it("finds the columns by name, in any order", () => {
    const text = file(["-0.5\t0.25\t00031\t42"], "INTPTLONG\tINTPTLAT\tGEOID\tALAND");
    expect(parseZctaGazetteer(text)).toEqual([{ zcta: "00031", point: { lat: 0.25, lon: -0.5 }, landM2: 42 }]);
  });

  it("refuses a text without the expected columns", () => {
    expect(() => parseZctaGazetteer("GEOID\tALAND\tINTPTLAT\n00011\t1\t0")).toThrow(/no column INTPTLONG/);
    expect(() => parseZctaGazetteer("")).toThrow(/GEOID, ALAND, INTPTLAT, INTPTLONG/);
    expect(() => parseZctaGazetteer("GEOID,ALAND,INTPTLAT,INTPTLONG\n00011,1,0,0")).toThrow(/not a ZCTA Gazetteer file/);
  });

  it("refuses a row with a bad value, and gives its line number", () => {
    expect(() => parseZctaGazetteer(file([ROWS[0] as string, "0001\t1\t0\t0\t0\t0\t0"]))).toThrow(/Line 3/);
    expect(() => parseZctaGazetteer(file(["00011\t1\t0\t0\t0\t91\t0"]))).toThrow(/Line 2/);
    expect(() => parseZctaGazetteer(file(["00011\t1\t0\t0\t0\tnorth\t0"]))).toThrow(/Line 2/);
    expect(() => parseZctaGazetteer(file(["00011\t1\t0\t0\t0\t\t0"]))).toThrow(/Line 2/);
    expect(() => parseZctaGazetteer(file(["00011\t-1\t0\t0\t0\t0\t0"]))).toThrow(/Line 2/);
    expect(() => parseZctaGazetteer(file(["00011\t1\t0\t0\t0\t0"]))).toThrow(/Line 2/);
  });

  it("skips the empty lines and gives no record for a file with only a header", () => {
    expect(parseZctaGazetteer(`${HEADER}\n\n   \n`)).toEqual([]);
    expect(parseZctaGazetteer(file(["", ROWS[1] as string, ""]))).toHaveLength(1);
  });
});

describe("zip5", () => {
  it("gives the 5 digits of a ZIP code and of a ZIP+4 code", () => {
    expect(zip5("00011")).toBe("00011");
    expect(zip5(" 00011-1234 ")).toBe("00011");
  });

  it("gives undefined for a text that is not a ZIP code", () => {
    for (const text of ["", "0001", "000111", "00011-123", "00011-12345", "00011 1234", "0001a", "ABCDE", "00011-"]) expect(zip5(text)).toBeUndefined();
  });
});

describe("zipCenter", () => {
  const index = zctaIndex(parseZctaGazetteer(file(ROWS)));

  it("gives the point of the ZCTA of a ZIP code", () => {
    expect(zipCenter("00011", index)).toEqual({ lat: 0.25, lon: -0.5 });
    expect(zipCenter("00012-0001", index)).toEqual({ lat: -0.125, lon: 0.75 });
  });

  it("gives undefined for a ZIP code with no ZCTA and for a text that is not a ZIP code", () => {
    expect(zipCenter("00013", index)).toBeUndefined();
    expect(zipCenter("0001", index)).toBeUndefined();
  });

  it("keeps the last record of a ZCTA that occurs again", () => {
    const again = zctaIndex([
      { zcta: "00011", point: { lat: 0, lon: 0 }, landM2: 1 },
      { zcta: "00011", point: { lat: 0.5, lon: 0.5 }, landM2: 1 },
    ]);
    expect(again.size).toBe(1);
    expect(zipCenter("00011", again)).toEqual({ lat: 0.5, lon: 0.5 });
  });
});
