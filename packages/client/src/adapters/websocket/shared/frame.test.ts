/**
 * The check of the shape of a WebSocket frame: each bad shape gets a refusal with the id of the
 * frame, and each frame of the protocol passes.
 */

import { describe, it, expect } from "vitest";
import { checkFrame } from "./frame.js";

const method = { service: "up", operation: "echo" };

describe("checkFrame", () => {
  it("passes the frames of the protocol, an unknown type and an unknown field", () => {
    const frames: unknown[] = [
      { type: "ping" },
      { id: "hello", type: "hello", protocol: 1 },
      { id: "a", type: "request", method, payload: { text: "x" }, metadata: { trace: "t" }, credit: 8 },
      { id: "a", type: "request", method: { ...method, version: "2" } },
      { id: "a", type: "response", payload: 1, status: { type: "success", code: 200 } },
      { id: "a", type: "error", status: { type: "error", code: "X", message: { detail: 1 } }, error: { code: 5, message: "x" } },
      { id: "a", type: "stream", seq: "not a number", stream: { done: true } },
      { id: "a", type: "server-request", path: ["up", "echo"], input: {} },
      { id: "a", type: "later-type", extra: [1, 2] },
      { id: "a", type: "request", method, metadata: null, status: null },
    ];
    for (const frame of frames) {
      const check = checkFrame(frame);
      expect(check, JSON.stringify(frame)).toMatchObject({ ok: true });
      if (check.ok) expect(check.frame).toBe(frame);
    }
  });

  it("refuses a frame that is not a JSON object, with the id unknown", () => {
    for (const value of [null, 5, "text", [], [{ id: "a", type: "ping" }], true]) {
      expect(checkFrame(value)).toEqual({ ok: false, id: "unknown", reason: "a frame is a JSON object" });
    }
  });

  it("refuses an id or a type that is not a text", () => {
    expect(checkFrame({ id: 7, type: "request" })).toEqual({ ok: false, id: "unknown", reason: "the field id is not a text" });
    expect(checkFrame({ id: "a" })).toEqual({ ok: false, id: "a", reason: "the field type is not a text" });
    expect(checkFrame({ id: "a", type: ["request"] })).toEqual({ ok: false, id: "a", reason: "the field type is not a text" });
  });

  it("refuses an object field of another type, with the id of the frame", () => {
    for (const field of ["metadata", "status", "error", "stream"]) {
      for (const bad of ["text", 1, [], true]) {
        expect(checkFrame({ id: "a", type: "request", method, [field]: bad })).toEqual({ ok: false, id: "a", reason: `the field ${field} is not a JSON object` });
      }
    }
  });

  it("refuses a method without the texts service and operation, and a path that is not a list of texts", () => {
    for (const bad of ["up.echo", [], { service: "up" }, { service: "up", operation: 1 }, { ...method, version: 2 }]) {
      expect(checkFrame({ id: "a", type: "request", method: bad })).toMatchObject({ ok: false, id: "a", reason: "the field method does not have the texts service and operation" });
    }
    for (const bad of ["up/echo", [1], {}]) {
      expect(checkFrame({ id: "a", type: "server-request", path: bad })).toMatchObject({ ok: false, id: "a", reason: "the field path is not a list of texts" });
    }
  });
});
