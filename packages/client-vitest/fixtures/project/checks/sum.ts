import { test, expect } from "vitest";
import { add } from "../math.js";

test("adds", () => expect(add(2, 3)).toBe(5));
test("adds zero", () => expect(add(2, 0)).toBe(2));
test.skip("later", () => {});
