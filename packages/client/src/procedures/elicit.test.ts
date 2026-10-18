/**
 * The questions of a procedure to the person at the caller, and the progress of a call
 * (CLI-12, CLI-10). A face puts `elicit` and `progress` on the request. The procedure gets them in
 * its context, the nested calls ask the same person, and only the call of the host reports
 * progress. The policy of the host adds the consents of the operator.
 */

import { describe, it, expect } from "vitest";
import { ProcedureRegistry } from "./registry.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { invokePath, outputValue } from "./invoke.js";
import type { AnyProcedure, ProcedureContext } from "./types.js";
import {
  createElicit,
  elicitConfirmation,
  elicitInput,
  elicitWithPolicy,
  operatorAnswer,
  NO_ELICITATION_REASON,
  type ElicitRequest,
  type ElicitResult,
} from "./elicit.js";
import type { ProgressUpdate } from "./progress.js";
import { untrustedFieldsOf, untrustedText, untrustedTextsOf } from "./untrusted.js";
import { ProcedureServer } from "../server/procedure-server.js";

const any = outputSchema<unknown>();

function registryWith(): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  const add = (path: string[], handler: (input: never, ctx: ProcedureContext) => unknown) =>
    registry.register(defineProcedure({ path, input: any, output: any, handler: handler as never }) as AnyProcedure);
  add(["ask", "confirm"], async (_input, ctx) => elicitConfirmation(ctx, "Go on?", { consent: "go" }));
  add(["ask", "outer"], async (_input, ctx) => ctx.client.call(["ask", "confirm"], {}));
  add(["ask", "progress"], async (_input, ctx) => {
    await ctx.progress?.({ progress: 1, total: 2 });
    return { has: ctx.progress !== undefined, nested: await ctx.client.call(["ask", "nestedProgress"], {}) };
  });
  add(["ask", "nestedProgress"], (_input, ctx) => ctx.progress !== undefined);
  return registry;
}

const yes = createElicit(["form"], async (request: ElicitRequest): Promise<ElicitResult> => ({
  action: "accept",
  content: request.mode === "url" ? {} : Object.fromEntries(Object.keys(request.fields).map((name) => [name, true])),
  by: "person",
}));

describe("ctx.elicit", () => {
  it("gives a clear refusal when no face can ask", async () => {
    const result = await elicitConfirmation({}, "Go on?");
    expect(result).toMatchObject({ action: "unavailable", confirmed: false, reason: NO_ELICITATION_REASON });
  });

  it("asks the person through the face, also in a nested call", async () => {
    const registry = registryWith();
    const value = await outputValue(await invokePath(["ask", "outer"], {}, { registry, elicit: yes }));
    expect(value).toMatchObject({ action: "accept", by: "person", confirmed: true });
  });

  it("gets the function from the request of a ProcedureServer", async () => {
    const registry = registryWith();
    const server = new ProcedureServer({ registry, autoRegister: true });
    const response = await server.handle({
      id: "1",
      method: { service: "ask", operation: "confirm" },
      payload: {},
      metadata: {},
      elicit: yes,
    });
    expect(response.payload).toMatchObject({ confirmed: true, by: "person" });
  });

  it("gives `unavailable` when the face throws", async () => {
    const broken = createElicit(["form"], async () => {
      throw new Error("client gone");
    });
    const result = await elicitInput({ elicit: broken }, { message: "Name?", fields: { name: { type: "string" } } });
    expect(result).toEqual({ action: "unavailable", reason: "The face could not get the answer of the person: client gone" });
  });

  it("gives `cancel` and does not throw when the call aborts", async () => {
    const controller = new AbortController();
    const waits = createElicit(["form"], (_request, options) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      });
    });
    const pending = elicitConfirmation({ elicit: waits, signal: controller.signal }, "Go on?");
    controller.abort();
    expect(await pending).toMatchObject({ action: "cancel", confirmed: false });
  });
});

describe("the elicitation policy of a host", () => {
  const question: ElicitRequest = { message: "Did you give the URL?", fields: { gave: { type: "boolean" } }, required: ["gave"], consent: "user-provided" };

  it("has no function without a face and without a consent", () => {
    expect(elicitWithPolicy(undefined)).toBeUndefined();
    expect(elicitWithPolicy(undefined, { operatorConsent: [] })).toBeUndefined();
  });

  it("lets the operator answer a question of its consent when the face cannot ask", async () => {
    const elicit = elicitWithPolicy(undefined, { operatorConsent: ["user-provided"] });
    expect(elicit?.modes).toEqual([]);
    expect(await elicit!(question)).toEqual({ action: "accept", content: { gave: true }, by: "operator" });
    const other = await elicit!({ ...question, consent: "other" });
    expect(other.action).toBe("unavailable");
    const { consent: _consent, ...withoutKey } = question as { consent?: string } & ElicitRequest;
    expect((await elicit!(withoutKey as ElicitRequest)).action).toBe("unavailable");
  });

  it("asks the person first: a decline of the person stays a decline", async () => {
    const no = createElicit(["form"], async () => ({ action: "decline", by: "person" }));
    const elicit = elicitWithPolicy(no, { operatorConsent: true });
    expect(await elicit!(question)).toEqual({ action: "decline", by: "person" });
  });

  it("does not let the operator answer when the face can ask and the question fails", async () => {
    // The person can see the question: a timeout or a lost connection is not a consent (review of #9)
    for (const failure of ["Request timed out", "Connection closed"]) {
      const broken = createElicit(["form"], async () => {
        throw new Error(failure);
      });
      const elicit = elicitWithPolicy(broken, { operatorConsent: true });
      expect(await elicit!(question)).toEqual({ action: "unavailable", reason: `The face could not get the answer of the person: ${failure}` });
      const confirmation = await elicitConfirmation({ elicit: elicitWithPolicy(broken, { operatorConsent: ["go"] }) }, "Go on?", { consent: "go" });
      expect(confirmation).toMatchObject({ action: "unavailable", confirmed: false });
    }
  });

  it("does not ask the person when the host turns asking off", async () => {
    let asked = false;
    const face = createElicit(["form"], async () => {
      asked = true;
      return { action: "accept", content: { gave: true }, by: "person" };
    });
    expect(elicitWithPolicy(face, { ask: false })).toBeUndefined();
    const operatorOnly = elicitWithPolicy(face, { ask: false, operatorConsent: true });
    expect((await operatorOnly!(question)).by).toBe("operator");
    expect(asked).toBe(false);
  });

  it("refuses a mode that the face cannot ask", async () => {
    const elicit = elicitWithPolicy(yes);
    const result = await elicit!({ mode: "url", message: "Sign in", url: "https://example.com" });
    expect(result.action).toBe("unavailable");
  });

  it("gives the defaults of the other fields, and no answer for a required field without a default", () => {
    expect(
      operatorAnswer({ message: "m", fields: { ok: { type: "boolean" }, why: { type: "string", default: "operator" } }, consent: "k" }, true),
    ).toEqual({ action: "accept", content: { ok: true, why: "operator" }, by: "operator" });
    expect(operatorAnswer({ message: "m", fields: { name: { type: "string" } }, required: ["name"], consent: "k" }, true)).toBeUndefined();
  });
});

describe("ctx.progress", () => {
  it("goes to the call of the host only, not to its nested calls", async () => {
    const registry = registryWith();
    const updates: ProgressUpdate[] = [];
    const value = await outputValue(
      await invokePath(["ask", "progress"], {}, { registry, progress: async (update) => void updates.push(update) }),
    );
    expect(value).toEqual({ has: true, nested: false });
    expect(updates).toEqual([{ progress: 1, total: 2 }]);
  });
});

describe("untrusted text", () => {
  it("reads the declared fields and the texts of a value", () => {
    const procedure = defineProcedure({ path: ["u", "t"], input: any, output: any, metadata: { untrusted: ["page", 3] as never }, handler: () => 1 });
    expect(untrustedFieldsOf(procedure as AnyProcedure)).toEqual(["page"]);
    expect(untrustedTextsOf(["a", untrustedText("b", { url: "https://x" }), 4])).toEqual([{ text: "a" }, { text: "b", source: { url: "https://x" } }]);
    expect(untrustedTextsOf(undefined)).toEqual([]);
  });
});
