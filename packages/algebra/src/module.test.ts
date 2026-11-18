import * as home from "@mark1russell7/algebra";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { algebraManifest, algebraModule } from "./module.js";

const registry = createRegistry(algebraModule);
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await outputValue(await invokePath(["algebra", name], input, { registry }), ["algebra", name])) as T;

describe("@procedures/algebra", () => {
  it("gives the same value as the function of the home", async () => {
    expect(await call("udpFrameLength", { payload: 1000 })).toBe(home.udpFrameLength(1000));
    expect(await call("udpFrameLength", { payload: 1000, family: 6 })).toBe(home.udpFrameLength(1000, 6));
    expect(await call("netemPacketTime", { length: 1514, rate: { rate: 1_250_000 } })).toBe(home.netemPacketTime(1514, { rate: 1_250_000 }));
    expect(await call("synGiveUpSends", { retries: 6, linear: 0 })).toBe(home.synGiveUpSends(6, 0));
    expect(await call("conntrackFloor", { max: 262144, hz: 1000 })).toBe(home.conntrackFloor(262144, 1000));
  });

  it("refuses an address family that the schema does not list", async () => {
    await expect(call("udpFrameLength", { payload: 1000, family: 5 })).rejects.toThrow();
  });

  it("gives a map the list of its entries, and a bigint its decimal string", async () => {
    expect(await call("portSearchShares", { size: 4, rounds: 2 })).toEqual([...home.portSearchShares(4, 2)]);
    expect(await call("portSearchChain", { size: 3 })).toEqual([...home.portSearchChain(3)]);
    const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? String(item) : item)));
    expect(await call("parseExpr", { text: "1 + 2 * x" })).toEqual(json(home.parseExpr("1 + 2 * x")));
  });

  it("names runMachine as an exemption, because its clock is not JSON", () => {
    expect(algebraManifest.exempt.find((exemption) => exemption.name === "runMachine")?.detail).toBe("options.clock: an object with the method now");
  });

  it("has a procedure with no effect for each function of the home", () => {
    expect(algebraManifest.procedures).toHaveLength(44);
    for (const procedure of algebraManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
  });
});
