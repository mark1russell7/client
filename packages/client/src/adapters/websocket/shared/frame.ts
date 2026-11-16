/**
 * The check of the shape of one WebSocket frame. The server and the client examine each parsed
 * frame here, before other code reads its fields.
 *
 * The check covers the fields that the code reads as objects or texts. A field of another
 * type, an unknown field or an unknown frame type passes: the rules of the protocol apply to them
 * (`WIRE-PROTOCOL.md`). A `null` value of an optional object field counts as no value.
 */

import type { WebSocketMessage } from "../server/types.js";

/** The outcome of the check: the frame, or the reason of the refusal and the `id` for the answer. */
export type FrameCheck =
  | { readonly ok: true; readonly frame: WebSocketMessage }
  | { readonly ok: false; readonly id: string; readonly reason: string };

/** The optional fields that hold a JSON object when they have a value. */
const OBJECT_FIELDS = ["metadata", "status", "error", "stream"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function isMethod(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["service"] === "string" &&
    typeof value["operation"] === "string" &&
    (value["version"] === undefined || typeof value["version"] === "string")
  );
}

function refusal(id: string, reason: string): FrameCheck {
  return { ok: false, id, reason };
}

/**
 * This function examines one parsed frame. It gives the frame, or a refusal with the `id` of the
 * frame (`"unknown"` when the frame has no `id` text).
 */
export function checkFrame(value: unknown): FrameCheck {
  if (!isRecord(value)) return refusal("unknown", "a frame is a JSON object");
  const id = value["id"];
  if (id !== undefined && typeof id !== "string") return refusal("unknown", "the field id is not a text");
  const answer = id || "unknown";
  if (typeof value["type"] !== "string") return refusal(answer, "the field type is not a text");
  for (const field of OBJECT_FIELDS) {
    if (!isAbsent(value[field]) && !isRecord(value[field])) return refusal(answer, `the field ${field} is not a JSON object`);
  }
  if (!isAbsent(value["method"]) && !isMethod(value["method"])) {
    return refusal(answer, "the field method does not have the texts service and operation");
  }
  const path = value["path"];
  if (!isAbsent(path) && !(Array.isArray(path) && path.every((segment) => typeof segment === "string"))) {
    return refusal(answer, "the field path is not a list of texts");
  }
  return { ok: true, frame: value as unknown as WebSocketMessage };
}
