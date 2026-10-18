/**
 * The questions of a procedure to the person at the caller (CLI-12).
 *
 * A face of a host (MCP, a terminal) can ask the person at the caller for input or for a
 * confirmation during a call. The face puts an `Elicit` function on the request, and the
 * procedure gets it as `ctx.elicit`. A face that cannot ask gives no function. Then the helpers
 * `elicitInput` and `elicitConfirmation` give the action `unavailable` with a reason, so a
 * procedure always gets a clear answer.
 *
 * The operator can answer some questions before the calls (`ElicitationPolicy.operatorConsent`):
 * a consent that the operator gives when the server starts. The person comes first: the operator
 * answers only when the face cannot ask the person.
 */

import type { Duration } from "../duration.js";
import type { ProcedureContext } from "./types.js";

// =============================================================================
// The fields of a form
// =============================================================================

/** The texts of a field that the face shows to the person. */
export interface ElicitFieldBase {
  /** The short name of the field. */
  readonly title?: string | undefined;
  /** The text that tells what the field is for. */
  readonly description?: string | undefined;
}

/** A field of free text. */
export interface ElicitTextField extends ElicitFieldBase {
  readonly type: "string";
  readonly enum?: undefined;
  readonly minLength?: number | undefined;
  readonly maxLength?: number | undefined;
  readonly format?: "email" | "uri" | "date" | "date-time" | undefined;
  readonly default?: string | undefined;
}

/** A field of a number. */
export interface ElicitNumberField extends ElicitFieldBase {
  readonly type: "number" | "integer";
  readonly minimum?: number | undefined;
  readonly maximum?: number | undefined;
  readonly default?: number | undefined;
}

/** A field of yes or no. */
export interface ElicitBooleanField extends ElicitFieldBase {
  readonly type: "boolean";
  readonly default?: boolean | undefined;
}

/** A field of one choice from a list. `enumNames` gives the text of each choice. */
export interface ElicitChoiceField extends ElicitFieldBase {
  readonly type: "string";
  readonly enum: readonly string[];
  readonly enumNames?: readonly string[] | undefined;
  readonly default?: string | undefined;
}

/** A field of some choices from a list. */
export interface ElicitChoicesField extends ElicitFieldBase {
  readonly type: "array";
  readonly items: { readonly type: "string"; readonly enum: readonly string[] };
  readonly minItems?: number | undefined;
  readonly maxItems?: number | undefined;
  readonly default?: readonly string[] | undefined;
}

/** A field of a form: the primitive fields of MCP elicitation. A form has no nested fields. */
export type ElicitField = ElicitTextField | ElicitNumberField | ElicitBooleanField | ElicitChoiceField | ElicitChoicesField;

/** The value of a field in an answer. */
export type ElicitValue = string | number | boolean | readonly string[];

// =============================================================================
// Questions and answers
// =============================================================================

/** A question with a form: the person fills in the fields. */
export interface ElicitFormRequest {
  readonly mode?: "form" | undefined;
  /** The question, as the face shows it to the person. */
  readonly message: string;
  /** The fields of the answer, by name. */
  readonly fields: Readonly<Record<string, ElicitField>>;
  /** The names of the fields that an accepted answer must have. */
  readonly required?: readonly string[] | undefined;
  /**
   * The key of the consent that the question asks for, for example `"user-provided"`. With a
   * key, the operator can give the consent before the calls (`ElicitationPolicy.operatorConsent`).
   * Without a key, only the person can answer.
   */
  readonly consent?: string | undefined;
}

/**
 * A question with a URL: the person opens the URL and completes a step outside the face (a
 * sign-in, a payment). The answer tells only if the person agreed to open it.
 */
export interface ElicitUrlRequest {
  readonly mode: "url";
  readonly message: string;
  readonly url: string;
  /** The id of the question. The default is a random id. */
  readonly id?: string | undefined;
}

/** A question to the person at the caller. */
export type ElicitRequest = ElicitFormRequest | ElicitUrlRequest;

/** The kind of a question: a form, or a URL. */
export type ElicitMode = "form" | "url";

/**
 * What the answer of a question is:
 * - `accept`: the person, or the operator, gave the answer.
 * - `decline`: the person said no.
 * - `cancel`: the person closed the question without a choice.
 * - `unavailable`: no one can answer. The face cannot ask the person, and no consent of the
 *   operator applies. `reason` tells why.
 */
export type ElicitAction = "accept" | "decline" | "cancel" | "unavailable";

/** The answer of a question. */
export interface ElicitResult {
  readonly action: ElicitAction;
  /** The values of the fields, for `accept`. */
  readonly content?: Readonly<Record<string, ElicitValue>> | undefined;
  /** Who answered: the person, or the operator (a consent of the start). Absent for `unavailable`. */
  readonly by?: "person" | "operator" | undefined;
  /** Why no one answered, for `unavailable`. */
  readonly reason?: string | undefined;
}

/** The options of one question. */
export interface ElicitOptions {
  /** When the signal aborts, the question stops. The default is the signal of the call. */
  readonly signal?: AbortSignal | undefined;
  /** The time that the face waits for the answer. The face has a default (MCP: 5 minutes). */
  readonly timeout?: Duration | undefined;
}

/**
 * The function that asks the person at the caller (`ctx.elicit`). `modes` tells which kinds of
 * question the face can ask the person. An empty list: only the operator answers.
 */
export interface Elicit {
  (request: ElicitRequest, options?: ElicitOptions): Promise<ElicitResult>;
  readonly modes: readonly ElicitMode[];
}

/** This function makes an `Elicit` function from the modes of a face and its ask function. */
export function createElicit(
  modes: readonly ElicitMode[],
  ask: (request: ElicitRequest, options: ElicitOptions) => Promise<ElicitResult>,
): Elicit {
  const elicit = (request: ElicitRequest, options?: ElicitOptions): Promise<ElicitResult> => ask(request, options ?? {});
  return Object.assign(elicit, { modes: Object.freeze([...modes]) });
}

// =============================================================================
// The policy of the host
// =============================================================================

/** The rules of a host for the questions of its procedures. */
export interface ElicitationPolicy {
  /** False: the face does not ask the person, also when it can. The default is true. */
  readonly ask?: boolean | undefined;
  /**
   * The consents that the operator gives when the server starts: `true` for each question with a
   * consent key, or a list of consent keys. The operator answers only when the face cannot ask
   * the person. The default is no consent. Example: `["user-provided"]` for the flag
   * `--allow-user-provided` of polite-crawler.
   */
  readonly operatorConsent?: boolean | readonly string[] | undefined;
  /** The time that the face waits for an answer, when the question gives no time. */
  readonly timeout?: Duration | undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The answer of the operator to a question, or undefined. The operator answers a form question
 * with a consent key that the operator gave. Each field of yes or no gets `true`, and another
 * field gets its default. The operator gives no answer when a necessary field has no default.
 */
export function operatorAnswer(
  request: ElicitRequest,
  consent: boolean | readonly string[] | undefined,
): ElicitResult | undefined {
  if (consent === undefined || consent === false || request.mode === "url" || request.consent === undefined) return undefined;
  if (consent !== true && !consent.includes(request.consent)) return undefined;
  const content: Record<string, ElicitValue> = {};
  for (const [name, field] of Object.entries(request.fields)) {
    if (field.type === "boolean") content[name] = true;
    else if (field.default !== undefined) content[name] = field.default;
    else if (request.required?.includes(name)) return undefined;
  }
  return { action: "accept", content, by: "operator" };
}

/**
 * This function applies the policy of a host to the `Elicit` function of a face. The result
 * asks the person when the face can. When the face cannot ask, or the question fails, the
 * consent of the operator answers, or the answer is `unavailable`. It gives undefined when no
 * one can answer a question: no face and no consent.
 */
export function elicitWithPolicy(face: Elicit | undefined, policy: ElicitationPolicy = {}): Elicit | undefined {
  const asker = policy.ask === false ? undefined : face;
  const consent = policy.operatorConsent;
  const operator = consent === true || (Array.isArray(consent) && consent.length > 0);
  if (!asker && !operator) return undefined;
  return createElicit(asker?.modes ?? [], async (request, options) => {
    const timed: ElicitOptions =
      options.timeout === undefined && policy.timeout !== undefined ? { ...options, timeout: policy.timeout } : options;
    const mode: ElicitMode = request.mode ?? "form";
    let reason: string;
    if (asker && asker.modes.includes(mode)) {
      try {
        return await asker(request, timed);
      } catch (error) {
        if (options.signal?.aborted) throw error;
        reason = `The face could not ask the person: ${messageOf(error)}`;
      }
    } else if (asker) {
      reason = `The face cannot ask a question of the mode "${mode}"`;
    } else {
      reason = policy.ask === false ? "The host does not ask the person" : "The face of the call cannot ask the person";
    }
    return operatorAnswer(request, consent) ?? { action: "unavailable", reason };
  });
}

// =============================================================================
// The helpers of a procedure
// =============================================================================

/** The reason of an answer when the context has no `elicit` function. */
export const NO_ELICITATION_REASON =
  "The face of the call cannot ask the person, and the operator gave no consent for this question";

/**
 * This function asks the person at the caller through `ctx.elicit`. It always gives an answer:
 * `unavailable` with a reason when the face cannot ask, or when the question fails. When the
 * call aborts, it throws the error of the abort.
 */
export async function elicitInput(
  ctx: Pick<ProcedureContext, "elicit" | "signal">,
  request: ElicitRequest,
  options: ElicitOptions = {},
): Promise<ElicitResult> {
  if (!ctx.elicit) return { action: "unavailable", reason: NO_ELICITATION_REASON };
  const signal = options.signal ?? ctx.signal;
  try {
    return await ctx.elicit(request, signal ? { ...options, signal } : options);
  } catch (error) {
    if (signal?.aborted) throw error;
    return { action: "unavailable", reason: messageOf(error) };
  }
}

/** The options of `elicitConfirmation`. */
export interface ConfirmationOptions extends ElicitOptions {
  /** The key of the consent, so the operator can give it before the calls. */
  readonly consent?: string | undefined;
  /** The name of the field of yes or no. The default is `"confirm"`. */
  readonly field?: string | undefined;
  /** The text of the field. The default is `"Yes"`. */
  readonly title?: string | undefined;
  /** The text that tells what a yes does. */
  readonly description?: string | undefined;
}

/** The answer of a confirmation. `confirmed` is true only for an accepted answer of yes. */
export interface ConfirmationResult extends ElicitResult {
  readonly confirmed: boolean;
}

/**
 * This function asks the person at the caller a question of yes or no. `confirmed` is true only
 * when the person, or the consent of the operator, says yes.
 */
export async function elicitConfirmation(
  ctx: Pick<ProcedureContext, "elicit" | "signal">,
  question: string,
  options: ConfirmationOptions = {},
): Promise<ConfirmationResult> {
  const { consent, field: fieldOption, title, description, ...elicitOptions } = options;
  const field = fieldOption ?? "confirm";
  const result = await elicitInput(
    ctx,
    {
      message: question,
      fields: { [field]: { type: "boolean", title: title ?? "Yes", ...(description !== undefined ? { description } : {}) } },
      required: [field],
      ...(consent !== undefined ? { consent } : {}),
    },
    elicitOptions,
  );
  return { ...result, confirmed: result.action === "accept" && result.content?.[field] === true };
}
