/**
 * client.min and client.max on a long array (audit pass 2: a spread of the array as arguments
 * overflowed the stack).
 */

import { describe, it, expect } from "vitest";
import { mathProcedures } from "./math.js";

const handlerOf = (name: string) => {
  const procedure = mathProcedures.find((p) => p.path.join(".") === `client.${name}`);
  if (!procedure?.handler) throw new Error(`client.${name} has no handler`);
  return procedure.handler as (input: { values: number[] }) => Promise<number>;
};

describe("client.min and client.max", () => {
  it("give the smallest and the largest value of 500000 values", async () => {
    const values = Array.from({ length: 500_000 }, (_, index) => (index * 7919) % 500_000);
    values[123_456] = -5;
    values[234_567] = 1e9;
    expect(await handlerOf("min")({ values })).toBe(-5);
    expect(await handlerOf("max")({ values })).toBe(1e9);
  });
});
