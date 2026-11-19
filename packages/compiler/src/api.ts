/**
 * The format `api-operation/1`: one operation of an HTTP API as data. The document gives the service, the
 * input, the request and the response. Each value of the request and of the response is a term of the formula
 * kit of `@mark1russell7/coeval`, with the standard table of operations (`STD_OPS`).
 *
 * Two pure functions use a document. `buildApiRequest` gives the URL, the method, the headers and the body of
 * one call. `extractApiResponse` reads the HTTP status, the headers and the body text of the answer into a
 * typed result. Neither function sends a request, so the caller gives the fetch.
 *
 * This entry imports no Node built-in, so a browser can also use it.
 *
 * A request holds the credentials in its headers. Do not log a request or its headers.
 */

import { type FormulaProfile, type Json, type Plan, type Result, STD_OPS, context, formulaMachine, prepare } from "@mark1russell7/coeval";
import { type OutputUnit, type Schema, type SchemaDraft, Validator } from "@cfworker/json-schema";

/** The name of the format of an operation document. */
export const API_OPERATION_FORMAT = "api-operation/1";

/** A term of the formula kit of `@mark1russell7/coeval`. A bare JSON value is a literal. */
export type ApiTerm = Json;

/** A JSON Schema (draft 2020-12 or draft-07). */
export type ApiJsonSchema = Readonly<Record<string, unknown>> | boolean;

/** The HTTP methods of an operation. */
export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A name and the term of its value: one entry of a query, of the headers or of a body. */
export type ApiPair = readonly [name: string, value: ApiTerm];

/**
 * The decoder of a field of an answer. A value that does not fit the decoder makes the field absent.
 * - `any`: each value except `null` and `undefined`.
 * - `text`: a text that is not empty.
 * - `integer`: an integer.
 * - `count`: an integer of 0 or more, or a text of decimal digits.
 * - `number`: a finite number.
 * - `bool`: a truth value.
 * - `date`: a text in the form of RFC 2822 or of ISO 8601. The field holds its time in milliseconds.
 */
export type ApiDecode = "any" | "text" | "integer" | "count" | "number" | "bool" | "date";

/** A field of an answer: its name, the term of its value and its decoder (`any` when it is absent). */
export type ApiField = readonly [name: string, value: ApiTerm, decode?: ApiDecode];

/**
 * The kind of a failure of a call.
 * - `network`: the request did not reach the service, or no answer came.
 * - `timeout`: no answer came in the time limit.
 * - `server`: the service had an error, or its answer does not fit the operation.
 * - `rate-limited`: the service refused the request because of its rate limit.
 * - `auth`: the service refused the credentials.
 * - `refused`: the service refused the input. The same request fails again.
 */
export type ApiFailureKind = "network" | "timeout" | "server" | "rate-limited" | "auth" | "refused";

/**
 * The authentication of a service. `secret` is the name of the credential binding. Its value is a record, and the
 * terms read it as the name `credential`. `schema` is the JSON Schema of that record.
 * - `basic`: the header `authorization` with the Basic scheme of RFC 7617, from the terms `user` and `password`.
 * - `bearer`: the header `authorization` with the Bearer scheme of RFC 6750, from the term `token`.
 * - `header`: the header `header` with the value of the term `value`.
 */
export type ApiAuth =
  | { readonly scheme: "basic"; readonly secret: string; readonly user: ApiTerm; readonly password: ApiTerm; readonly schema?: ApiJsonSchema }
  | { readonly scheme: "bearer"; readonly secret: string; readonly token: ApiTerm; readonly schema?: ApiJsonSchema }
  | { readonly scheme: "header"; readonly secret: string; readonly header: string; readonly value: ApiTerm; readonly schema?: ApiJsonSchema };

/** A rule of the errors: the HTTP status from `from` to `to` gives a failure of the kind `kind`. */
export interface ApiStatusRule {
  readonly from: number;
  readonly to: number;
  readonly kind: ApiFailureKind;
  /** The term of the reason when the answer has no message. It reads the names `status` and `body`. */
  readonly reason: ApiTerm;
}

/** The errors of a service: the kinds of the HTTP statuses, and the error envelope of its answers. */
export interface ApiErrors {
  /** The rules of the statuses outside the success range. The first rule that holds the status applies. */
  readonly statuses?: readonly ApiStatusRule[];
  /** The kind and the reason of a status that no rule holds. The default is `server`. */
  readonly otherwise?: { readonly kind: ApiFailureKind; readonly reason: ApiTerm };
  /** The term of the message of an error answer, a text. It reads the names `status` and `body`. */
  readonly message?: ApiTerm;
  /** The term of the error code of an error answer, an integer. */
  readonly code?: ApiTerm;
  /** The wait before the same request goes again, for the failures of the kinds `kinds`. */
  readonly retry?: { readonly header: string; readonly minMs: number; readonly kinds: readonly ApiFailureKind[] };
}

/** The service of an operation. */
export interface ApiService {
  /** The origin: `https://`, the host and an optional port, with no path. */
  readonly origin: string;
  readonly auth?: ApiAuth;
  readonly errors?: ApiErrors;
}

/** The request of an operation. The terms read the names `input` and `credential`. */
export interface ApiRequestSpec {
  readonly method: ApiMethod;
  /** The term of the path: a text that starts with `/`. */
  readonly path: ApiTerm;
  /** The entries of the query, in order. A name can occur more than one time. */
  readonly query?: readonly ApiPair[];
  /** The headers, in order. Each name is a lowercase token. */
  readonly headers?: readonly ApiPair[];
  /** The body: a form (`application/x-www-form-urlencoded`) or a JSON object, with its fields in order. */
  readonly body?: { readonly type: "form" | "json"; readonly fields: readonly ApiPair[] };
}

/** The response of an operation. The terms read the names `status` and `body`. */
export interface ApiResponseSpec {
  /** The range of the HTTP statuses of a success. The default is 200 to 299. */
  readonly ok?: readonly [from: number, to: number];
  /** The form of the body: a JSON object (the default), a JSON value, or no body. */
  readonly body?: "object" | "json" | "none";
  /** The JSON Schema of the body of a success. */
  readonly schema?: ApiJsonSchema;
  /** The term of the reason when the body of a success is not JSON, or does not fit `schema`. */
  readonly invalid?: ApiTerm;
  /** The fields of a success, in order. */
  readonly fields: readonly ApiField[];
}

/** One operation of an HTTP API as data (the format `api-operation/1`). */
export interface ApiOperation {
  readonly format: typeof API_OPERATION_FORMAT;
  readonly name?: string;
  readonly summary?: string;
  readonly service: ApiService;
  /** The JSON Schema of the input. */
  readonly input: ApiJsonSchema;
  readonly request: ApiRequestSpec;
  readonly response: ApiResponseSpec;
}

/** One call of an API. Its fields fit the `init` of `fetch`. */
export interface ApiRequest {
  readonly url: string;
  readonly method: ApiMethod;
  /** The headers. They hold the credentials. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** The parts of an HTTP response that `extractApiResponse` reads. A `Response` of `fetch` and its text fit it. */
export interface ApiResponse {
  readonly status: number;
  readonly text: string;
  readonly headers?: { get(name: string): string | null } | undefined;
}

/**
 * A request that `buildApiRequest` cannot make.
 * - `input`: the input does not fit the input schema.
 * - `credential`: the credential binding is absent, or its record does not fit its schema.
 * - `operation`: a term of the operation gives an error, or a value that the request cannot hold.
 */
export interface ApiBuildFailure {
  readonly ok: false;
  readonly kind: "input" | "credential" | "operation";
  readonly errors: readonly string[];
}

/** The result of `buildApiRequest`. */
export type ApiBuild = { readonly ok: true; readonly request: ApiRequest } | ApiBuildFailure;

/** A call that failed. `extractApiResponse` does not throw: it gives a failure. */
export interface ApiFailure {
  readonly ok: false;
  readonly kind: ApiFailureKind;
  /** The HTTP status. It is `0` when no answer came. */
  readonly status: number;
  /** The message of the service, or the reason of the failure. */
  readonly errors: readonly string[];
  /** The error code of the service. */
  readonly code?: number;
  /** The shortest wait before the same request goes again. */
  readonly retryAfterMs?: number;
}

/** A success: the fields of the answer that have a value. */
export interface ApiSuccess {
  readonly ok: true;
  readonly [field: string]: unknown;
}

/** The result of `extractApiResponse`. */
export type ApiRead = ApiSuccess | ApiFailure;

// =============================================================================
// The check of the structure
// =============================================================================

const METHODS: ReadonlySet<string> = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const KINDS: ReadonlySet<string> = new Set(["network", "timeout", "server", "rate-limited", "auth", "refused"]);
const DECODES: ReadonlySet<string> = new Set(["any", "text", "integer", "count", "number", "bool", "date"]);
const TOKEN = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;
const ORIGIN = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$/;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const isSchema = (value: unknown): boolean => typeof value === "boolean" || isRecord(value);
const isStatus = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599;

function pairIssues(pairs: unknown, where: string, header: boolean, unique: boolean): string[] {
  if (pairs === undefined) return [];
  if (!Array.isArray(pairs)) return [`${where} is not a list.`];
  const issues: string[] = [];
  const seen = new Set<string>();
  pairs.forEach((pair: unknown, index) => {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || pair[0] === "") {
      issues.push(`The entry ${index} of ${where} is not a pair of a name and a term.`);
      return;
    }
    const name = pair[0];
    if (header && (!TOKEN.test(name) || name === "__proto__")) issues.push(`The header name ${JSON.stringify(name)} is not a lowercase token.`);
    if (unique && seen.has(name)) issues.push(`The name ${JSON.stringify(name)} occurs more than one time in ${where}.`);
    seen.add(name);
  });
  return issues;
}

function authIssues(auth: unknown): string[] {
  if (auth === undefined) return [];
  if (!isRecord(auth)) return ["The authentication is not a record."];
  const issues: string[] = [];
  if (typeof auth["secret"] !== "string" || auth["secret"] === "") issues.push("The authentication has no name of a credential binding.");
  if (auth["schema"] !== undefined && !isSchema(auth["schema"])) issues.push("The schema of the credential is not a JSON Schema.");
  const has = (key: string): void => {
    if (!Object.hasOwn(auth, key)) issues.push(`The authentication ${String(auth["scheme"])} has no term ${key}.`);
  };
  if (auth["scheme"] === "basic") ["user", "password"].forEach(has);
  else if (auth["scheme"] === "bearer") has("token");
  else if (auth["scheme"] === "header") {
    has("value");
    if (typeof auth["header"] !== "string" || !TOKEN.test(auth["header"]) || auth["header"] === "authorization") issues.push("The header of the authentication is not a lowercase token other than authorization.");
  } else issues.push("The scheme of the authentication is not basic, bearer or header.");
  return issues;
}

function errorsIssues(errors: unknown): string[] {
  if (errors === undefined) return [];
  if (!isRecord(errors)) return ["The errors of the service are not a record."];
  const issues: string[] = [];
  const statuses = errors["statuses"];
  if (statuses !== undefined) {
    if (!Array.isArray(statuses)) issues.push("The status rules are not a list.");
    else
      statuses.forEach((rule: unknown, index) => {
        if (!isRecord(rule) || !isStatus(rule["from"]) || !isStatus(rule["to"]) || (rule["from"] as number) > (rule["to"] as number)) {
          issues.push(`The status rule ${index} has no range of HTTP statuses from 100 to 599.`);
        } else {
          if (!KINDS.has(String(rule["kind"]))) issues.push(`The status rule ${index} has no failure kind.`);
          if (!Object.hasOwn(rule, "reason")) issues.push(`The status rule ${index} has no term reason.`);
        }
      });
  }
  const otherwise = errors["otherwise"];
  if (otherwise !== undefined && (!isRecord(otherwise) || !KINDS.has(String(otherwise["kind"])) || !Object.hasOwn(otherwise, "reason"))) {
    issues.push("The rule otherwise has no failure kind or no term reason.");
  }
  const retry = errors["retry"];
  if (retry !== undefined) {
    const valid =
      isRecord(retry) &&
      typeof retry["header"] === "string" &&
      TOKEN.test(retry["header"]) &&
      Number.isInteger(retry["minMs"]) &&
      (retry["minMs"] as number) >= 0 &&
      Array.isArray(retry["kinds"]) &&
      retry["kinds"].every((kind) => KINDS.has(String(kind)));
    if (!valid) issues.push("The retry rule has no lowercase header, no wait of 0 or more milliseconds, or a kind that is not a failure kind.");
  }
  return issues;
}

function requestIssues(request: unknown): string[] {
  if (!isRecord(request)) return ["The request is not a record."];
  const issues: string[] = [];
  if (!METHODS.has(String(request["method"]))) issues.push("The method is not GET, POST, PUT, PATCH or DELETE.");
  if (!Object.hasOwn(request, "path")) issues.push("The request has no term path.");
  issues.push(...pairIssues(request["query"], "the query", false, false));
  issues.push(...pairIssues(request["headers"], "the headers", true, true));
  const headers = Array.isArray(request["headers"]) ? request["headers"] : [];
  for (const pair of headers) {
    if (Array.isArray(pair) && (pair[0] === "authorization" || pair[0] === "content-type")) issues.push(`The header ${String(pair[0])} comes from the authentication or from the body, not from the headers.`);
  }
  const body = request["body"];
  if (body !== undefined) {
    if (!isRecord(body) || (body["type"] !== "form" && body["type"] !== "json")) issues.push("The body is not a record with the type form or json.");
    else issues.push(...pairIssues(body["fields"], "the body", false, body["type"] === "json"));
    if (request["method"] === "GET") issues.push("A GET request has no body.");
  }
  return issues;
}

function responseIssues(response: unknown): string[] {
  if (!isRecord(response)) return ["The response is not a record."];
  const issues: string[] = [];
  const ok = response["ok"];
  if (ok !== undefined && !(Array.isArray(ok) && ok.length === 2 && isStatus(ok[0]) && isStatus(ok[1]) && ok[0] <= ok[1])) {
    issues.push("The success range is not a range of HTTP statuses from 100 to 599.");
  }
  const body = response["body"];
  if (body !== undefined && body !== "object" && body !== "json" && body !== "none") issues.push("The body of the response is not object, json or none.");
  if (response["schema"] !== undefined && !isSchema(response["schema"])) issues.push("The schema of the response is not a JSON Schema.");
  const fields = response["fields"];
  if (!Array.isArray(fields)) return [...issues, "The fields of the response are not a list."];
  const seen = new Set<string>();
  fields.forEach((field: unknown, index) => {
    if (!Array.isArray(field) || field.length < 2 || field.length > 3 || typeof field[0] !== "string" || field[0] === "") {
      issues.push(`The field ${index} of the response is not a name, a term and an optional decoder.`);
      return;
    }
    const name = field[0];
    if (name === "ok" || name === "__proto__") issues.push(`The field name ${name} of the response is reserved.`);
    if (seen.has(name)) issues.push(`The field ${name} occurs more than one time in the response.`);
    seen.add(name);
    if (field.length === 3 && !DECODES.has(String(field[2]))) issues.push(`The decoder of the field ${name} is not a decoder of the format.`);
  });
  return issues;
}

/**
 * This function gives the problems of the structure of an operation document, or an empty list. It does not check
 * the terms. `buildApiRequest` and `extractApiResponse` throw an error for a document with a problem.
 */
export function apiOperationIssues(operation: unknown): string[] {
  if (!isRecord(operation)) return ["The operation is not a record."];
  const issues: string[] = [];
  if (operation["format"] !== API_OPERATION_FORMAT) issues.push(`The format is not ${API_OPERATION_FORMAT}.`);
  if (!isSchema(operation["input"])) issues.push("The input schema is not a JSON Schema.");
  const service = operation["service"];
  if (!isRecord(service)) issues.push("The service is not a record.");
  else {
    const origin = service["origin"];
    if (typeof origin !== "string" || !ORIGIN.test(origin)) issues.push("The origin is not https:// and a lowercase host, with an optional port and no path.");
    issues.push(...authIssues(service["auth"]), ...errorsIssues(service["errors"]));
  }
  issues.push(...requestIssues(operation["request"]), ...responseIssues(operation["response"]));
  return issues;
}

// =============================================================================
// The compiled form of an operation
// =============================================================================

/** A JSON Schema as a check: it gives the JSON Pointers and the messages of the problems of a value. */
type SchemaCheck = (value: unknown) => readonly { readonly path: string; readonly message: string }[];

interface Compiled {
  readonly term: (doc: ApiTerm) => Plan;
  readonly input: SchemaCheck;
  readonly credential: SchemaCheck | undefined;
  readonly body: SchemaCheck | undefined;
}

/** The profile of the terms: the standard table, and a record leaves out a field with the error `#N/A`. */
const PROFILE: FormulaProfile = { ...STD_OPS, omit: (error) => error.code === "#N/A" };
const MACHINE = formulaMachine(PROFILE);
const COMPILED = new WeakMap<object, Compiled>();

/** This function gives the draft of a JSON Schema from its `$schema`. Draft 6 is read as draft 7, and each other value as 2020-12. */
function draftOf(schema: Readonly<Record<string, unknown>>): SchemaDraft {
  const uri = typeof schema["$schema"] === "string" ? schema["$schema"] : "";
  if (/draft-0?4\b/.test(uri)) return "4";
  if (/draft-0?[67]\b/.test(uri)) return "7";
  if (uri.includes("2019-09")) return "2019-09";
  return "2020-12";
}

/** This function gives the JSON Pointer of an instance location of the validator. The location is a URI fragment, for example `#/a%20b`. */
function instancePointer(location: string): string {
  const fragment = location.startsWith("#") ? location.slice(1) : location;
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/** The keywords whose error tells the cause better than the errors of their subschemas: no branch or more than one branch fits. */
const CHOICES = new Set(["anyOf", "oneOf", "contains"]);

/**
 * This function keeps the errors that tell a cause. An error below `anyOf`, `oneOf` or `contains` goes, because the error of
 * the keyword tells the cause. The error of a `false` subschema goes when an other error tells its place. Then an error goes
 * when an error of its subschema remains, for example the error of `properties` above the error of a `pattern`.
 */
function causes(errors: readonly OutputUnit[]): OutputUnit[] {
  const choices = errors.filter((error) => CHOICES.has(error.keyword)).map((error) => `${error.keywordLocation}/`);
  const kept = errors.filter(
    (error) => !(error.keyword === "false" && errors.length > 1) && !choices.some((prefix) => error.keywordLocation.startsWith(prefix)),
  );
  return kept.filter((error) => !kept.some((other) => other !== error && other.keywordLocation.startsWith(`${error.keywordLocation}/`)));
}

/**
 * This function gives the check of a JSON Schema, by the validator of `@cfworker/json-schema`. The validator gets a copy of
 * the schema, because it adds properties to each object of the schema.
 */
function schemaCheck(schema: ApiJsonSchema): SchemaCheck {
  if (schema === true) return () => [];
  if (schema === false) return () => [{ path: "", message: "No value fits the schema false." }];
  const validator = new Validator(JSON.parse(JSON.stringify(schema)) as Schema, draftOf(schema), false);
  return (value) => {
    const result = validator.validate(value);
    return result.valid ? [] : causes(result.errors).map((error) => ({ path: instancePointer(error.instanceLocation), message: error.error }));
  };
}

function compiled(operation: ApiOperation): Compiled {
  const cached = COMPILED.get(operation);
  if (cached !== undefined) return cached;
  const issues = apiOperationIssues(operation);
  if (issues.length > 0) throw new Error(`The operation is not valid: ${issues.join(" ")}`);
  const plans = new Map<ApiTerm, Plan>();
  // A term of an object or a list is a key by its identity, and a bare literal by its value. The root of a term is
  // a position of a term, thus a bare JSON value there is a literal.
  const term = (doc: ApiTerm): Plan => {
    let plan = plans.get(doc);
    if (plan === undefined) {
      plan = prepare(MACHINE, doc, { declaredType: "lit" });
      plans.set(doc, plan);
    }
    return plan;
  };
  const auth = operation.service.auth;
  const result: Compiled = {
    term,
    input: schemaCheck(operation.input),
    credential: auth?.schema === undefined ? undefined : schemaCheck(auth.schema),
    body: operation.response.schema === undefined ? undefined : schemaCheck(operation.response.schema),
  };
  COMPILED.set(operation, result);
  return result;
}

/** The value of a term, `absent` for the error `#N/A`, or the error. */
type Value = { readonly ok: true; readonly value: unknown } | { readonly ok: true; readonly absent: true } | { readonly ok: false; readonly text: string };

function evaluateTerm(c: Compiled, doc: ApiTerm, names: Readonly<Record<string, unknown>>): Value {
  const result: Result = c.term(doc).evaluate(context({ names }));
  if (result.ok) return result.value === undefined ? { ok: true, absent: true } : { ok: true, value: result.value };
  if (result.error.code === "#N/A") return { ok: true, absent: true };
  return { ok: false, text: `${result.error.code}: ${result.error.reason ?? "no reason"}` };
}

// =============================================================================
// Requests
// =============================================================================

/**
 * The web globals that the builder uses. Browsers, Node.js and the other runtimes of WinterTC give them. The lib of
 * this package is `esnext` only, with no DOM and no Node.js types, so this view gives their types.
 */
interface WebGlobals {
  btoa(data: string): string;
  readonly TextEncoder: new () => { encode(text: string): Uint8Array };
  readonly URLSearchParams: new (init: readonly (readonly [string, string])[]) => { toString(): string };
}

const WEB = globalThis as unknown as WebGlobals;
const form = (pairs: readonly (readonly [string, string])[]): string => new WEB.URLSearchParams(pairs).toString();

const FORM = "application/x-www-form-urlencoded";
const JSON_TYPE = "application/json";
const SEGMENT = /^(?:[A-Za-z0-9\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*$/;
const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]*$/;

class BuildError extends Error {
  readonly kind: ApiBuildFailure["kind"];
  readonly errors: readonly string[];

  constructor(kind: ApiBuildFailure["kind"], errors: readonly string[]) {
    super(errors.join(" "));
    this.kind = kind;
    this.errors = errors;
  }
}

function needValue(c: Compiled, doc: ApiTerm, names: Readonly<Record<string, unknown>>, what: string): unknown {
  const value = evaluateTerm(c, doc, names);
  if (!value.ok) throw new BuildError("operation", [`The term of ${what} gives ${value.text}`]);
  if ("absent" in value) throw new BuildError("operation", [`The term of ${what} gives no value.`]);
  return value.value;
}

function needText(c: Compiled, doc: ApiTerm, names: Readonly<Record<string, unknown>>, what: string): string {
  const value = needValue(c, doc, names, what);
  if (typeof value !== "string") throw new BuildError("operation", [`The term of ${what} gives no text.`]);
  return value;
}

/** This function gives the text of a value of a form, a query or a header, or `undefined` for no value. */
function scalarText(value: unknown, what: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  throw new BuildError("operation", [`The term of ${what} gives a value that is not a text, a finite number or a truth value.`]);
}

function pairsOf(c: Compiled, pairs: readonly ApiPair[] | undefined, names: Readonly<Record<string, unknown>>, where: string): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, doc] of pairs ?? []) {
    const value = evaluateTerm(c, doc, names);
    if (!value.ok) throw new BuildError("operation", [`The term of ${name} in ${where} gives ${value.text}`]);
    if ("absent" in value) continue;
    const text = scalarText(value.value, `${name} in ${where}`);
    if (text !== undefined) out.push([name, text]);
  }
  return out;
}

function jsonBody(c: Compiled, pairs: readonly ApiPair[], names: Readonly<Record<string, unknown>>): string {
  // A record with no prototype keeps the key __proto__ as a plain key.
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [name, doc] of pairs) {
    const value = evaluateTerm(c, doc, names);
    if (!value.ok) throw new BuildError("operation", [`The term of ${name} in the body gives ${value.text}`]);
    if (!("absent" in value)) out[name] = value.value;
  }
  return JSON.stringify(out);
}

/** This function gives the base64 of the UTF-8 bytes of a text. */
function base64(text: string): string {
  let binary = "";
  for (const byte of new WEB.TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return WEB.btoa(binary);
}

function authHeader(c: Compiled, auth: ApiAuth, names: Readonly<Record<string, unknown>>): [string, string] {
  switch (auth.scheme) {
    case "basic": {
      const user = needText(c, auth.user, names, "the user of the authentication");
      const password = needText(c, auth.password, names, "the password of the authentication");
      if (user.includes(":")) throw new BuildError("credential", ["The user of the Basic authentication has a colon."]);
      return ["authorization", `Basic ${base64(`${user}:${password}`)}`];
    }
    case "bearer":
      return ["authorization", `Bearer ${needText(c, auth.token, names, "the token of the authentication")}`];
    case "header":
      return [auth.header, needText(c, auth.value, names, "the value of the authentication")];
  }
}

function credentialOf(c: Compiled, auth: ApiAuth, credentials: Readonly<Record<string, unknown>>): unknown {
  const credential = Object.hasOwn(credentials, auth.secret) ? credentials[auth.secret] : undefined;
  if (credential === undefined || credential === null) throw new BuildError("credential", [`No credential has the binding ${auth.secret}.`]);
  // The problems give only the paths, never a value: a value can be a secret.
  const problems = c.credential?.(credential) ?? [];
  if (problems.length > 0) {
    throw new BuildError(
      "credential",
      problems.map((problem) => `The credential ${auth.secret} does not fit its schema${problem.path === "" ? "" : ` at ${problem.path}`}.`),
    );
  }
  return credential;
}

function pathOf(c: Compiled, request: ApiRequestSpec, names: Readonly<Record<string, unknown>>): string {
  const path = needText(c, request.path, names, "the path");
  const segments = path.split("/").slice(1);
  if (!path.startsWith("/") || segments.some((segment) => segment === "." || segment === ".." || !SEGMENT.test(segment))) {
    throw new BuildError("operation", ["The path is not a slash and segments of RFC 3986 with no dot segment."]);
  }
  return path;
}

function buildOrThrow(c: Compiled, operation: ApiOperation, input: unknown, credentials: Readonly<Record<string, unknown>>): ApiRequest {
  const problems = c.input(input);
  if (problems.length > 0) throw new BuildError("input", problems.map((problem) => (problem.path === "" ? problem.message : `${problem.path}: ${problem.message}`)));
  const auth = operation.service.auth;
  const names: Record<string, unknown> = { input };
  if (auth !== undefined) names["credential"] = credentialOf(c, auth, credentials);
  const { request } = operation;
  const query = pairsOf(c, request.query, names, "the query");
  const search = query.length === 0 ? "" : `?${form(query)}`;
  const url = `${operation.service.origin}${pathOf(c, request, names)}${search}`;
  const headers: Record<string, string> = {};
  const entries: [string, string][] = [];
  if (auth !== undefined) entries.push(authHeader(c, auth, names));
  entries.push(...pairsOf(c, request.headers, names, "the headers"));
  let body: string | undefined;
  if (request.body !== undefined) {
    const isForm = request.body.type === "form";
    body = isForm ? form(pairsOf(c, request.body.fields, names, "the body")) : jsonBody(c, request.body.fields, names);
    entries.push(["content-type", isForm ? FORM : JSON_TYPE]);
  }
  for (const [name, value] of entries) {
    if (!HEADER_VALUE.test(value)) throw new BuildError("operation", [`The value of the header ${name} has a control character.`]);
    headers[name] = value;
  }
  return body === undefined ? { url, method: request.method, headers } : { url, method: request.method, headers, body };
}

/**
 * This function gives the request of one call of an operation. It checks the input against the input schema and
 * the credential against its schema, then it evaluates the terms. It does not send the request.
 *
 * @param operation - The operation document. A document with a problem of its structure makes the function throw.
 * @param input - The input of the call. The terms read it as the name `input`.
 * @param credentials - The credential records by the name of their binding. The terms read the record of the
 *   binding of the authentication as the name `credential`.
 * @returns The request, or a failure of the kind `input`, `credential` or `operation`.
 */
export function buildApiRequest(operation: ApiOperation, input: unknown, credentials: Readonly<Record<string, unknown>> = {}): ApiBuild {
  const c = compiled(operation);
  try {
    return { ok: true, request: buildOrThrow(c, operation, input, credentials) };
  } catch (error) {
    if (error instanceof BuildError) return { ok: false, kind: error.kind, errors: error.errors };
    throw error;
  }
}

// =============================================================================
// Responses
// =============================================================================

/** This function gives the JSON body of a text in the form of the operation, or `undefined`. */
function parseBody(text: string, form: "object" | "json" | "none"): unknown {
  if (form === "none") return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return form === "json" || isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function decode(value: unknown, decoder: ApiDecode): unknown {
  switch (decoder) {
    case "any":
      return value === null ? undefined : value;
    case "text":
      return typeof value === "string" && value !== "" ? value : undefined;
    case "integer":
      return Number.isInteger(value) ? value : undefined;
    case "count":
      if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
      return Number.isInteger(value) && (value as number) >= 0 ? value : undefined;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    case "bool":
      return typeof value === "boolean" ? value : undefined;
    case "date": {
      const at = typeof value === "string" ? Date.parse(value) : Number.NaN;
      return Number.isFinite(at) ? at : undefined;
    }
  }
}

/** This function gives the decoded value of an optional term, or `undefined` for no value or an error. */
function optional(c: Compiled, doc: ApiTerm | undefined, names: Readonly<Record<string, unknown>>, decoder: ApiDecode): unknown {
  if (doc === undefined) return undefined;
  const value = evaluateTerm(c, doc, names);
  return value.ok && !("absent" in value) ? decode(value.value, decoder) : undefined;
}

/** This function gives the text of a reason term. A term that gives no text gives a reason that tells it. */
function reasonOf(c: Compiled, doc: ApiTerm, names: Readonly<Record<string, unknown>>): string {
  const value = evaluateTerm(c, doc, names);
  if (value.ok && !("absent" in value) && typeof value.value === "string") return value.value;
  return `The reason term of the operation gives ${value.ok ? "no text." : value.text}`;
}

function retryAfter(errors: ApiErrors | undefined, kind: ApiFailureKind, response: ApiResponse): number | undefined {
  const retry = errors?.retry;
  if (retry === undefined || !retry.kinds.includes(kind)) return undefined;
  // The format reads only the delay in seconds of RFC 9110. A date in the header gives the least wait.
  const value = response.headers?.get(retry.header)?.trim();
  return value !== undefined && /^\d+$/.test(value) ? Math.max(Number(value) * 1000, retry.minMs) : retry.minMs;
}

function failure(kind: ApiFailureKind, response: ApiResponse, errors: ApiErrors | undefined, reason: string, message?: unknown, code?: unknown): ApiFailure {
  const wait = retryAfter(errors, kind, response);
  return {
    ok: false,
    kind,
    status: response.status,
    errors: [typeof message === "string" ? message : reason],
    ...(code === undefined ? {} : { code: code as number }),
    ...(wait === undefined ? {} : { retryAfterMs: wait }),
  };
}

/**
 * This function reads the answer of one call of an operation into a success or a failure. It does not throw for
 * an answer. A document with a problem of its structure makes it throw.
 *
 * - A status outside the success range gives a failure of the kind of the first status rule that holds it.
 * - A body of a success that is not JSON, or does not fit the schema, gives a failure of the kind `server`.
 * - A field term that gives an error other than `#N/A` gives a failure of the kind `server`. The answer then has a
 *   value that the term cannot read, and the schema did not refuse it.
 */
export function extractApiResponse(operation: ApiOperation, response: ApiResponse): ApiRead {
  const c = compiled(operation);
  const spec = operation.response;
  const errors = operation.service.errors;
  const form = spec.body ?? "object";
  const body = parseBody(response.text, form);
  const names = { status: response.status, body };
  const [from, to] = spec.ok ?? [200, 299];
  if (response.status < from || response.status > to) {
    const rule = errors?.statuses?.find((each) => response.status >= each.from && response.status <= each.to) ?? errors?.otherwise;
    const kind = rule?.kind ?? "server";
    const reason = rule === undefined ? `The service gave HTTP ${response.status}.` : reasonOf(c, rule.reason, names);
    return failure(kind, response, errors, reason, optional(c, errors?.message, names, "text"), optional(c, errors?.code, names, "integer"));
  }
  const invalid = (): ApiFailure => failure("server", response, errors, spec.invalid === undefined ? "The answer does not fit the operation." : reasonOf(c, spec.invalid, names));
  if (form !== "none" && body === undefined) return invalid();
  if (c.body !== undefined && c.body(body).length > 0) return invalid();
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [name, doc, decoder] of spec.fields) {
    const value = evaluateTerm(c, doc, names);
    if (!value.ok) return failure("server", response, errors, `The field ${name} of the answer gives ${value.text}`);
    if ("absent" in value) continue;
    const decoded = decode(value.value, decoder ?? "any");
    if (decoded !== undefined) out[name] = decoded;
  }
  return { ok: true, ...out };
}
