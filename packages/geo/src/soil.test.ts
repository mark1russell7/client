import { describe, expect, it } from "vitest";
import { SEPTIC_RULE, SOIL_DATA_ACCESS_URL, soilComponents, soilExchange, soilQuery } from "./soil.js";

const columns = ["mukey", "muname", "compname", "comppct_r", "interphrc", "interphr", "slope_l", "slope_r", "slope_h", "drainagecl", "hydricrating"];

// The answer of Soil Data Access at (-69.2, 44.9), read on 2026-11-22
const answer = {
  Table: [
    columns,
    ["1483115", "Kenduskeag-Monarda complex, 0 to 8 percent slopes, very stony", "Kenduskeag", "45", "Very limited", "1", "2", "5", "8", "Somewhat poorly drained", "No"],
    ["1483115", "Kenduskeag-Monarda complex, 0 to 8 percent slopes, very stony", "Monarda", "35", "Very limited", "1", "0", "3", "5", "Poorly drained", "Yes"],
  ],
};

describe("soilQuery", () => {
  it("puts the point into the query as two numbers with 6 decimals", () => {
    const query = soilQuery(-69.2, 44.9);
    expect(query).toContain("SDA_Get_Mukey_from_intersection_with_WktWgs84('point(-69.200000 44.900000)')");
    expect(query).toContain(`ci.mrulename = '${SEPTIC_RULE}'`);
    expect(query).toContain("c.majcompflag = 'Yes'");
  });

  it("refuses a point that is not on the map", () => {
    expect(() => soilQuery(Number.NaN, 44)).toThrow(RangeError);
    expect(() => soilQuery(-181, 44)).toThrow(RangeError);
    expect(() => soilQuery(-70, 91)).toThrow(RangeError);
    expect(() => soilQuery(Number.POSITIVE_INFINITY, 0)).toThrow(RangeError);
  });
});

describe("soilExchange", () => {
  it("gives a POST with the query in a JSON body and the user agent", () => {
    const exchange = soilExchange(-71.5, 44.5, "test-agent/1.0");
    expect(exchange.method).toBe("POST");
    expect(exchange.url).toBe(SOIL_DATA_ACCESS_URL);
    expect(exchange.headers).toMatchObject({ "content-type": "application/json", "user-agent": "test-agent/1.0" });
    const body = JSON.parse(String(exchange.body)) as { query: string; format: string };
    expect(body.format).toBe("JSON+COLUMNNAME");
    expect(body.query).toBe(soilQuery(-71.5, 44.5));
  });

  it("uses the base URL that the caller gives", () => {
    expect(soilExchange(0, 0, "a", "https://soil.example.org/post.rest").url).toBe("https://soil.example.org/post.rest");
  });
});

describe("soilComponents", () => {
  it("gives each major component with its septic rating, slope, drainage and hydric rating", () => {
    const components = soilComponents(answer);
    expect(components).toHaveLength(2);
    expect(components[0]).toEqual({
      mukey: "1483115",
      mapUnit: "Kenduskeag-Monarda complex, 0 to 8 percent slopes, very stony",
      component: "Kenduskeag",
      percent: 45,
      septic: "Very limited",
      septicValue: 1,
      slope: { low: 2, representative: 5, high: 8 },
      drainage: "Somewhat poorly drained",
      hydric: "No",
    });
    expect(components[1]?.hydric).toBe("Yes");
  });

  it("gives an empty list when the survey has no map unit at the point", () => {
    expect(soilComponents({})).toEqual([]);
  });

  it("gives null for an empty cell and for a rating class that it does not know", () => {
    const [component] = soilComponents({ Table: [columns, ["1", "Water", "Water", null, "Not rated", "", null, "", null, "", null]] });
    expect(component).toMatchObject({ percent: null, septic: null, septicValue: null, slope: { low: null, representative: null, high: null }, drainage: null, hydric: null });
  });

  it("does not take the column order for granted", () => {
    const reversed = [...columns].reverse();
    const row = [...answer.Table[1]!].reverse();
    expect(soilComponents({ Table: [reversed, row] })[0]?.component).toBe("Kenduskeag");
  });

  it("refuses an answer that is not a table with column names", () => {
    expect(() => soilComponents(null)).toThrow(/not an object/);
    expect(() => soilComponents([])).toThrow(/not an object/);
    expect(() => soilComponents({ Table: [] })).toThrow(/no table/);
    expect(() => soilComponents({ Table: [columns.slice(1)] })).toThrow(/no column mukey/);
    expect(() => soilComponents({ Table: [columns, "row"] })).toThrow(/not a list/);
  });
});
