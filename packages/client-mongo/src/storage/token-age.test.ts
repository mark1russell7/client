import type { Clock } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { clusterTimeOfToken, tokenAge } from "./token-age.js";

/** A resume token of the server form: the type byte `82`, the timestamp, and a rest that changes inside one cluster time. */
const token = (seconds: number, increment: number, rest = "2B022C0100296E5A1004"): { _data: string } => ({
  _data: `82${seconds.toString(16).padStart(8, "0")}${increment.toString(16).padStart(8, "0")}${rest}`.toUpperCase(),
});

/** A clock that a test sets. Its timers do not run. */
function setClock(): Clock & { at: number } {
  const clock = { at: 0, now: () => clock.at, after: () => () => undefined };
  return clock as Clock & { at: number };
}

describe("the cluster time of a resume token (CLI-110)", () => {
  it("reads the timestamp of a token of the server, in the order of the times", () => {
    expect(clusterTimeOfToken(token(0x6900_0000, 7))).toBe("6900000000000007");
    const times = [token(5, 1), token(5, 2), token(6, 0), token(0x1_0000, 0)].map(clusterTimeOfToken);
    expect([...times].sort()).toEqual(times);
  });

  it("gives undefined for a token of another form", () => {
    for (const other of [undefined, null, "82", { _data: 7 }, { _data: "e3" }, { _data: "8200" }, { _data: "83" + "0".repeat(16) }, { _data: "82zz00000000000000" }]) {
      expect(clusterTimeOfToken(other)).toBeUndefined();
    }
  });
});

describe("the age of the token of a watcher (CLI-110)", () => {
  it("counts from the start before the first token", () => {
    const clock = setClock();
    const age = tokenAge(clock);
    clock.at = 250;
    expect(age.ageMs()).toBe(250);
  });

  it("moves at a later cluster time, and not at the same cluster time again", () => {
    const clock = setClock();
    const age = tokenAge(clock, token(10, 1));
    clock.at = 100;
    age.note(token(10, 1));
    age.note(token(10, 1, "FF"));
    expect(age.ageMs()).toBe(100);
    age.note(token(10, 2));
    expect(age.ageMs()).toBe(0);
    clock.at = 160;
    age.note(token(9, 9));
    expect(age.ageMs()).toBe(60);
    age.note(token(11, 0));
    expect(age.ageMs()).toBe(0);
  });

  it("moves at a different token when a token has no cluster time, and never at an empty token", () => {
    const clock = setClock();
    const age = tokenAge(clock);
    clock.at = 40;
    age.note(undefined);
    age.note(null);
    expect(age.ageMs()).toBe(40);
    age.note({ _data: "e1" });
    expect(age.ageMs()).toBe(0);
    clock.at = 70;
    age.note({ _data: "e1" });
    expect(age.ageMs()).toBe(30);
    age.note({ _data: "b2" });
    expect(age.ageMs()).toBe(0);
  });

  it("takes its time from the clock that the watcher gets", () => {
    const clock = setClock();
    clock.at = 1_000;
    const age = tokenAge(clock);
    clock.at = 1_500;
    expect(age.ageMs()).toBe(500);
  });
});
