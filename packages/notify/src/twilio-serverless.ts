/**
 * Twilio Serverless (https://www.twilio.com/docs/serverless/api) as pure functions: the services, the
 * functions and the assets, their versions, the builds, the environments, the variables and the
 * deployments. A request builder gives the URL, the method, the headers and the body of one call. An
 * extractor reads the HTTP status, the headers and the body text of the response into a typed result.
 * Neither function sends a request. `callTwilio` of `./twilio` sends one request through the fetch of
 * the caller.
 *
 * This entry imports no Node built-in, so a browser can also use it.
 *
 * Each time in this file is in milliseconds.
 *
 * A request holds the credentials in its `authorization` header. Do not log a request or its headers.
 */

import {
  FORM,
  date,
  failure,
  some,
  sort,
  text,
  twilioRequestOf,
  type Body,
  type TwilioCredentials,
  type TwilioFailure,
  type TwilioRequest,
  type TwilioResponse,
} from "./twilio-common.js";

/** The base of the Twilio Serverless API. */
export const TWILIO_SERVERLESS_API = "https://serverless.twilio.com/v1";

/** The base of the uploads of the Twilio Serverless API. Only the function versions and the asset versions use it. */
export const TWILIO_SERVERLESS_UPLOAD_API = "https://serverless-upload.twilio.com/v1";

/** The limits of the Twilio Serverless API, in characters. The limit of the value of a variable is in bytes of UTF-8. */
export const TWILIO_SERVERLESS_LIMITS: {
  readonly serviceName: 50;
  readonly friendlyName: 255;
  readonly path: 255;
  readonly environmentName: 100;
  readonly domainSuffix: 16;
  readonly variableKey: 128;
  readonly variableValueBytes: 450;
  readonly pageSize: 1000;
} = { serviceName: 50, friendlyName: 255, path: 255, environmentName: 100, domainSuffix: 16, variableKey: 128, variableValueBytes: 450, pageSize: 1000 };

/** The defaults of `twilioServerlessBuildStep`: a read of the status each 2 seconds, for 5 minutes at most. */
export const TWILIO_SERVERLESS_BUILD_POLL: { readonly intervalMs: 2_000; readonly timeoutMs: 300_000 } = { intervalMs: 2_000, timeoutMs: 300_000 };

/**
 * The access to a function or an asset.
 * - `public`: each person on the internet can use it.
 * - `protected`: only a request with a valid signature of Twilio can use it.
 * - `private`: only the functions of the service can use it.
 */
export type TwilioServerlessVisibility = "public" | "protected" | "private";

/** The input of a new service. */
export interface TwilioServerlessServiceInput {
  /** The unique name of the service: 50 characters at most. A fetch can use it in place of the SID. */
  readonly uniqueName: string;
  /** The name that the Console shows: 255 characters at most. */
  readonly friendlyName: string;
  /** When it is true, each function gets the credentials of the account in its context. The default of Twilio is true. */
  readonly includeCredentials?: boolean | undefined;
  /** When it is true, a person can change the service in the Console. The default of Twilio is false. */
  readonly uiEditable?: boolean | undefined;
}

/** One file of a function version or of an asset version. The file is text. */
export interface TwilioServerlessFile {
  /** The path of the file in the service: a slash, then the characters of a URL path. 255 characters at most. */
  readonly path: string;
  readonly visibility: TwilioServerlessVisibility;
  /** The text of the file. */
  readonly content: string;
  /** The media type of the file. Without it, a function version is `application/javascript`, and an asset version is `application/json`. */
  readonly contentType?: string | undefined;
}

/** The input of a build. A build needs at least one function version or one asset version. */
export interface TwilioServerlessBuildInput {
  /** The SIDs of the function versions (`ZN` and 32 hexadecimal digits). */
  readonly functionVersions?: readonly string[] | undefined;
  /** The SIDs of the asset versions (`ZN` and 32 hexadecimal digits). */
  readonly assetVersions?: readonly string[] | undefined;
  /** The npm packages of the functions: the name and the version of each, as the `dependencies` of a `package.json`. */
  readonly dependencies?: Readonly<Record<string, string>> | undefined;
  /** The runtime of the functions, for example `node22`. Without it, Twilio uses its default runtime. */
  readonly runtime?: string | undefined;
}

/** The input of a new environment. */
export interface TwilioServerlessEnvironmentInput {
  /** The unique name of the environment: 100 characters at most. */
  readonly uniqueName: string;
  /** The end of the domain name of the environment: 1 to 16 letters, digits and hyphens. */
  readonly domainSuffix?: string | undefined;
}

/** One variable of an environment. The functions read it from their context. */
export interface TwilioServerlessVariableInput {
  /** The name of the variable: 128 characters at most. */
  readonly key: string;
  /** The value: 450 bytes of UTF-8 at most. */
  readonly value: string;
}

/** The options of a read of a list. */
export interface TwilioServerlessPageOptions {
  /** The count of items in one page: 1 to 1000. The default of Twilio is 50. */
  readonly pageSize?: number | undefined;
}

/** A service. */
export interface TwilioServerlessService {
  /** The SID of the service: `ZS` and 32 hexadecimal digits. */
  readonly sid: string;
  readonly uniqueName: string;
  readonly friendlyName?: string;
  readonly includeCredentials?: boolean;
  readonly uiEditable?: boolean;
  /** The start of the domain name of each environment of the service. */
  readonly domainBase?: string;
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

/** A function or an asset of a service. */
export interface TwilioServerlessResource {
  /** The SID of the function or of the asset: `ZH` and 32 hexadecimal digits. */
  readonly sid: string;
  readonly serviceSid: string;
  readonly friendlyName?: string;
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

/** A version of a function or of an asset. */
export interface TwilioServerlessVersion {
  /** The SID of the version: `ZN` and 32 hexadecimal digits. */
  readonly sid: string;
  readonly serviceSid: string;
  /** The SID of the function or of the asset (`ZH`). */
  readonly resourceSid: string;
  readonly path: string;
  readonly visibility: TwilioServerlessVisibility;
  readonly createdAt?: number;
}

/** A build of a service. */
export interface TwilioServerlessBuild {
  /** The SID of the build: `ZB` and 32 hexadecimal digits. */
  readonly sid: string;
  readonly serviceSid: string;
  /** The status of Twilio: `building`, `completed` or `failed`. The poll operates on another status as on `building`. */
  readonly status: string;
  /** The runtime, for example `node22`. The read of the status does not have it. */
  readonly runtime?: string;
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

/** An environment of a service. */
export interface TwilioServerlessEnvironment {
  /** The SID of the environment: `ZE` and 32 hexadecimal digits. */
  readonly sid: string;
  readonly serviceSid: string;
  readonly uniqueName: string;
  /** The domain name of the environment, for example `example-1234-dev.twil.io`. Each function of a deployment has an address in it. */
  readonly domainName: string;
  readonly domainSuffix?: string;
  /** The SID of the build of the last deployment. A new environment does not have it. */
  readonly buildSid?: string;
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

/** A variable of an environment. */
export interface TwilioServerlessVariable {
  /** The SID of the variable: `ZV` and 32 hexadecimal digits. */
  readonly sid: string;
  readonly serviceSid: string;
  readonly environmentSid: string;
  readonly key: string;
  /** The value. It can be a secret: do not log it. */
  readonly value: string;
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

/** A deployment of a build to an environment. */
export interface TwilioServerlessDeployment {
  /** The SID of the deployment: `ZD` and 32 hexadecimal digits. */
  readonly sid: string;
  readonly serviceSid: string;
  readonly environmentSid: string;
  readonly buildSid?: string;
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

/** The success of an extractor: the item, with `ok: true`. */
export type TwilioServerlessRead<Item> = { readonly ok: true } & Item;

/** One page of a list. */
export interface TwilioServerlessPage<Item> {
  readonly ok: true;
  readonly items: readonly Item[];
  /** The address of the next page. `twilioServerlessNextPageRequest` reads it. The last page does not have it. */
  readonly nextPageUrl?: string;
}

/** The state of the poll of one build. */
export interface TwilioServerlessBuildPoll {
  readonly serviceSid: string;
  readonly buildSid: string;
  /** The time of the start of the build, on the clock of the caller. */
  readonly startedAt: number;
  /** The wait between two reads of the status. The default is 2 seconds. */
  readonly intervalMs?: number | undefined;
  /** The longest time of the build, from `startedAt`. The default is 5 minutes. */
  readonly timeoutMs?: number | undefined;
}

/**
 * The next step of the poll of a build.
 * - `poll`: wait `waitMs`, then send `request`, and give the read to the next step.
 * - `done`: the build is complete. A deployment can use it.
 * - `failed`: the build failed, or Twilio refused the read. `last` tells which.
 * - `timed-out`: the build did not end in its time limit.
 */
export type TwilioServerlessBuildStep =
  | { readonly step: "poll"; readonly waitMs: number; readonly request: TwilioRequest }
  | { readonly step: "done"; readonly last: TwilioServerlessRead<TwilioServerlessBuild> }
  | { readonly step: "failed"; readonly last: TwilioServerlessRead<TwilioServerlessBuild> | TwilioFailure }
  | { readonly step: "timed-out"; readonly elapsedMs: number; readonly last?: TwilioServerlessRead<TwilioServerlessBuild> | TwilioFailure };

// =============================================================================
// Request builders
// =============================================================================

const SID = {
  ZS: /^ZS[0-9a-fA-F]{32}$/,
  ZH: /^ZH[0-9a-fA-F]{32}$/,
  ZN: /^ZN[0-9a-fA-F]{32}$/,
  ZB: /^ZB[0-9a-fA-F]{32}$/,
  ZE: /^ZE[0-9a-fA-F]{32}$/,
  ZV: /^ZV[0-9a-fA-F]{32}$/,
  ZD: /^ZD[0-9a-fA-F]{32}$/,
} as const;
type Prefix = keyof typeof SID;

/** A path of a file: a slash, then the characters of a URL path (RFC 3986) and percent escapes. */
const PATH = /^\/(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/]|%[0-9A-Fa-f]{2})*$/;
/** A media type without parameters, for example `application/json` (RFC 6838). */
const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
const DOMAIN_SUFFIX = /^[A-Za-z0-9-]+$/;
const RUNTIME = /^node[0-9]{1,3}$/;
const VISIBILITIES: ReadonlySet<string> = new Set(["public", "protected", "private"]);

/** This function gives the SID, or it throws an error when the SID does not have its form. */
function sid(value: string, prefix: Prefix, what: string): string {
  if (!SID[prefix].test(value)) throw new Error(`The ${what} SID is not ${prefix} and 32 hexadecimal digits.`);
  return value;
}

/** This function gives the name, or it throws an error when the name is empty or too long. */
function named(value: string, max: number, what: string): string {
  if (value.trim() === "") throw new Error(`The ${what} is empty.`);
  if (value.length > max) throw new Error(`The ${what} has more than ${max} characters.`);
  return value;
}

const serviceUrl = (serviceSid: string): string => `${TWILIO_SERVERLESS_API}/Services/${sid(serviceSid, "ZS", "service")}`;
const environmentUrl = (serviceSid: string, environmentSid: string): string =>
  `${serviceUrl(serviceSid)}/Environments/${sid(environmentSid, "ZE", "environment")}`;

function post(credentials: TwilioCredentials, url: string, fields: URLSearchParams): TwilioRequest {
  return twilioRequestOf(credentials, "POST", url, { type: FORM, text: fields.toString() });
}

function list(credentials: TwilioCredentials, url: string, options: TwilioServerlessPageOptions = {}): TwilioRequest {
  if (options.pageSize === undefined) return twilioRequestOf(credentials, "GET", url);
  const size = options.pageSize;
  if (!(Number.isInteger(size) && size >= 1 && size <= TWILIO_SERVERLESS_LIMITS.pageSize)) throw new Error(`The page size is not 1 to ${TWILIO_SERVERLESS_LIMITS.pageSize}.`);
  return twilioRequestOf(credentials, "GET", `${url}?${new URLSearchParams({ PageSize: String(size) }).toString()}`);
}

/** This function gives the boundary of a multipart body: a fixed prefix and the first count whose boundary is in no part. */
function boundaryOf(parts: readonly string[]): string {
  for (let count = 0; ; count += 1) {
    const boundary = `notify-twilio-serverless-${count}`;
    if (!parts.some((part) => part.includes(boundary))) return boundary;
  }
}

/** This function gives the multipart body (RFC 7578) of the fields and of one file. The same input gives the same body. */
function multipart(
  fields: readonly (readonly [string, string])[],
  file: { readonly name: string; readonly filename: string; readonly type: string; readonly content: string },
): { readonly type: string; readonly text: string } {
  const boundary = boundaryOf([...fields.flat(), file.name, file.filename, file.type, file.content]);
  const lines: string[] = [];
  for (const [name, value] of fields) lines.push(`--${boundary}`, `Content-Disposition: form-data; name="${name}"`, "", value);
  lines.push(
    `--${boundary}`,
    `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"`,
    `Content-Type: ${file.type}`,
    "",
    file.content,
    `--${boundary}--`,
    "",
  );
  return { type: `multipart/form-data; boundary=${boundary}`, text: lines.join("\r\n") };
}

function upload(credentials: TwilioCredentials, url: string, file: TwilioServerlessFile, type: string): TwilioRequest {
  if (file.path.length > TWILIO_SERVERLESS_LIMITS.path) throw new Error(`The path has more than ${TWILIO_SERVERLESS_LIMITS.path} characters.`);
  if (!PATH.test(file.path)) throw new Error("The path is not a slash and the characters of a URL path.");
  if (!VISIBILITIES.has(file.visibility)) throw new Error(`${String(file.visibility)} is not a visibility: public, protected or private.`);
  const contentType = file.contentType ?? type;
  if (!MEDIA_TYPE.test(contentType)) throw new Error("The content type is not a media type, for example application/json.");
  const filename = file.path.slice(file.path.lastIndexOf("/") + 1).replace(/[^A-Za-z0-9._-]/g, "_") || "content";
  const body = multipart(
    [
      ["Path", file.path],
      ["Visibility", file.visibility],
    ],
    { name: "Content", filename, type: contentType, content: file.content },
  );
  return twilioRequestOf(credentials, "POST", url, body);
}

/** This function gives the request that makes a service. It throws an error when the input breaks a rule of the API. */
export function twilioServerlessServiceRequest(credentials: TwilioCredentials, service: TwilioServerlessServiceInput): TwilioRequest {
  const fields = new URLSearchParams({
    UniqueName: named(service.uniqueName, TWILIO_SERVERLESS_LIMITS.serviceName, "unique name of the service"),
    FriendlyName: named(service.friendlyName, TWILIO_SERVERLESS_LIMITS.friendlyName, "friendly name of the service"),
  });
  if (service.includeCredentials !== undefined) fields.append("IncludeCredentials", String(service.includeCredentials === true));
  if (service.uiEditable !== undefined) fields.append("UiEditable", String(service.uiEditable === true));
  return post(credentials, `${TWILIO_SERVERLESS_API}/Services`, fields);
}

/**
 * This function gives the request that reads one service, by its SID or by its unique name. Twilio
 * gives the HTTP status 404 when the service does not exist.
 */
export function twilioServerlessServiceFetchRequest(credentials: TwilioCredentials, sidOrUniqueName: string): TwilioRequest {
  named(sidOrUniqueName, TWILIO_SERVERLESS_LIMITS.serviceName, "SID or unique name of the service");
  if (sidOrUniqueName === "." || sidOrUniqueName === "..") throw new Error("The unique name of the service is a dot segment of a path.");
  return twilioRequestOf(credentials, "GET", `${TWILIO_SERVERLESS_API}/Services/${encodeURIComponent(sidOrUniqueName)}`);
}

/** This function gives the request that makes a function of a service. The function has no code until a function version. */
export function twilioServerlessFunctionRequest(credentials: TwilioCredentials, serviceSid: string, friendlyName: string): TwilioRequest {
  const fields = new URLSearchParams({ FriendlyName: named(friendlyName, TWILIO_SERVERLESS_LIMITS.friendlyName, "friendly name of the function") });
  return post(credentials, `${serviceUrl(serviceSid)}/Functions`, fields);
}

/** This function gives the request that reads the functions of a service, one page at a time. */
export function twilioServerlessFunctionListRequest(credentials: TwilioCredentials, serviceSid: string, options?: TwilioServerlessPageOptions): TwilioRequest {
  return list(credentials, `${serviceUrl(serviceSid)}/Functions`, options);
}

/** This function gives the request that makes an asset of a service. The asset has no content until an asset version. */
export function twilioServerlessAssetRequest(credentials: TwilioCredentials, serviceSid: string, friendlyName: string): TwilioRequest {
  const fields = new URLSearchParams({ FriendlyName: named(friendlyName, TWILIO_SERVERLESS_LIMITS.friendlyName, "friendly name of the asset") });
  return post(credentials, `${serviceUrl(serviceSid)}/Assets`, fields);
}

/** This function gives the request that reads the assets of a service, one page at a time. */
export function twilioServerlessAssetListRequest(credentials: TwilioCredentials, serviceSid: string, options?: TwilioServerlessPageOptions): TwilioRequest {
  return list(credentials, `${serviceUrl(serviceSid)}/Assets`, options);
}

/**
 * This function gives the request that uploads the code of a function as a new version. The request
 * goes to the upload host, with a multipart body. It throws an error when the input breaks a rule of the API.
 */
export function twilioServerlessFunctionVersionRequest(
  credentials: TwilioCredentials,
  serviceSid: string,
  functionSid: string,
  file: TwilioServerlessFile,
): TwilioRequest {
  const url = `${TWILIO_SERVERLESS_UPLOAD_API}/Services/${sid(serviceSid, "ZS", "service")}/Functions/${sid(functionSid, "ZH", "function")}/Versions`;
  return upload(credentials, url, file, "application/javascript");
}

/**
 * This function gives the request that uploads the content of an asset as a new version. The request
 * goes to the upload host, with a multipart body. It throws an error when the input breaks a rule of the API.
 */
export function twilioServerlessAssetVersionRequest(credentials: TwilioCredentials, serviceSid: string, assetSid: string, file: TwilioServerlessFile): TwilioRequest {
  const url = `${TWILIO_SERVERLESS_UPLOAD_API}/Services/${sid(serviceSid, "ZS", "service")}/Assets/${sid(assetSid, "ZH", "asset")}/Versions`;
  return upload(credentials, url, file, "application/json");
}

/**
 * This function gives the request that starts a build of versions. Twilio gives the status `building`
 * at the start. `twilioServerlessBuildStep` polls the status. It throws an error when the input breaks a rule of the API.
 */
export function twilioServerlessBuildRequest(credentials: TwilioCredentials, serviceSid: string, build: TwilioServerlessBuildInput): TwilioRequest {
  const functions = build.functionVersions ?? [];
  const assets = build.assetVersions ?? [];
  if (functions.length + assets.length === 0) throw new Error("A build needs at least one function version or one asset version.");
  const fields = new URLSearchParams();
  for (const version of assets) fields.append("AssetVersions", sid(version, "ZN", "asset version"));
  for (const version of functions) fields.append("FunctionVersions", sid(version, "ZN", "function version"));
  if (build.dependencies !== undefined) {
    const dependencies = Object.entries(build.dependencies).map(([name, version]) => {
      if (name.trim() === "" || typeof version !== "string" || version.trim() === "") throw new Error("A dependency needs a name and a version.");
      return { name, version };
    });
    fields.append("Dependencies", JSON.stringify(dependencies));
  }
  if (build.runtime !== undefined) {
    if (!RUNTIME.test(build.runtime)) throw new Error("The runtime is not node and a version, for example node22.");
    fields.append("Runtime", build.runtime);
  }
  return post(credentials, `${serviceUrl(serviceSid)}/Builds`, fields);
}

/** This function gives the request that reads the status of a build. `extractTwilioServerlessBuild` reads the response. */
export function twilioServerlessBuildStatusRequest(credentials: TwilioCredentials, serviceSid: string, buildSid: string): TwilioRequest {
  return twilioRequestOf(credentials, "GET", `${serviceUrl(serviceSid)}/Builds/${sid(buildSid, "ZB", "build")}/Status`);
}

/** This function gives the request that makes an environment of a service. It throws an error when the input breaks a rule of the API. */
export function twilioServerlessEnvironmentRequest(
  credentials: TwilioCredentials,
  serviceSid: string,
  environment: TwilioServerlessEnvironmentInput,
): TwilioRequest {
  const fields = new URLSearchParams({ UniqueName: named(environment.uniqueName, TWILIO_SERVERLESS_LIMITS.environmentName, "unique name of the environment") });
  if (environment.domainSuffix !== undefined) {
    const suffix = environment.domainSuffix;
    if (!(DOMAIN_SUFFIX.test(suffix) && suffix.length <= TWILIO_SERVERLESS_LIMITS.domainSuffix)) throw new Error("The domain suffix is not 1 to 16 letters, digits and hyphens.");
    fields.append("DomainSuffix", suffix);
  }
  return post(credentials, `${serviceUrl(serviceSid)}/Environments`, fields);
}

/** This function gives the request that reads the environments of a service, one page at a time. */
export function twilioServerlessEnvironmentListRequest(credentials: TwilioCredentials, serviceSid: string, options?: TwilioServerlessPageOptions): TwilioRequest {
  return list(credentials, `${serviceUrl(serviceSid)}/Environments`, options);
}

/** This function gives the request that reads the variables of an environment, one page at a time. The response has the values. */
export function twilioServerlessVariableListRequest(
  credentials: TwilioCredentials,
  serviceSid: string,
  environmentSid: string,
  options?: TwilioServerlessPageOptions,
): TwilioRequest {
  return list(credentials, `${environmentUrl(serviceSid, environmentSid)}/Variables`, options);
}

/** This function throws an error when a value has more than 450 bytes of UTF-8. The error does not hold the value. */
function assertValue(value: string): void {
  if (new TextEncoder().encode(value).length > TWILIO_SERVERLESS_LIMITS.variableValueBytes) {
    throw new Error(`The value of the variable has more than ${TWILIO_SERVERLESS_LIMITS.variableValueBytes} bytes.`);
  }
}

/**
 * This function gives the request that makes a variable of an environment. A deployment of the
 * environment gives the variable to its functions. It throws an error when the input breaks a rule of the API.
 */
export function twilioServerlessVariableRequest(
  credentials: TwilioCredentials,
  serviceSid: string,
  environmentSid: string,
  variable: TwilioServerlessVariableInput,
): TwilioRequest {
  const key = named(variable.key, TWILIO_SERVERLESS_LIMITS.variableKey, "key of the variable");
  assertValue(variable.value);
  return post(credentials, `${environmentUrl(serviceSid, environmentSid)}/Variables`, new URLSearchParams({ Key: key, Value: variable.value }));
}

/** This function gives the request that changes the value of a variable. It throws an error when the value has more than 450 bytes. */
export function twilioServerlessVariableUpdateRequest(
  credentials: TwilioCredentials,
  serviceSid: string,
  environmentSid: string,
  variableSid: string,
  value: string,
): TwilioRequest {
  const url = `${environmentUrl(serviceSid, environmentSid)}/Variables/${sid(variableSid, "ZV", "variable")}`;
  assertValue(value);
  return post(credentials, url, new URLSearchParams({ Value: value }));
}

/**
 * This function gives the request that deploys a complete build to an environment. Then the functions
 * of the build answer at the domain of the environment. The request always names the build: a
 * deployment without a build removes the functions of the environment.
 */
export function twilioServerlessDeploymentRequest(credentials: TwilioCredentials, serviceSid: string, environmentSid: string, buildSid: string): TwilioRequest {
  const url = `${environmentUrl(serviceSid, environmentSid)}/Deployments`;
  return post(credentials, url, new URLSearchParams({ BuildSid: sid(buildSid, "ZB", "build") }));
}

/**
 * This function gives the request that reads the next page of a list, from `nextPageUrl`. It throws
 * an error when the address is not on the host of the Twilio Serverless API, so the credentials go to no other host.
 */
export function twilioServerlessNextPageRequest(credentials: TwilioCredentials, nextPageUrl: string): TwilioRequest {
  const base = new URL(TWILIO_SERVERLESS_API);
  let url: URL;
  try {
    url = new URL(nextPageUrl);
  } catch {
    throw new Error("The next page is not an address.");
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`) || url.username !== "" || url.password !== "") {
    throw new Error("The next page is not an address of the Twilio Serverless API.");
  }
  return twilioRequestOf(credentials, "GET", url.href);
}

// =============================================================================
// The poll of a build
// =============================================================================

/**
 * This function gives the next step of the poll of a build. It has no timer: the caller waits `waitMs`,
 * sends the request, and gives the read to the next call.
 *
 * - `last` is the last read of the build: the response of the build or of a status read, or a failure.
 * - Without `last`, the step reads the status at once. With a read of `building`, it waits `intervalMs`.
 * - After a failure that can go again, it waits `intervalMs` or `retryAfterMs`, the longer of the two.
 * - A failure of the kind `auth` or `refused` ends the poll as `failed`.
 * - The wait of the last poll ends at the time limit. It throws an error for a poll with an input that is not valid.
 */
export function twilioServerlessBuildStep(
  credentials: TwilioCredentials,
  poll: TwilioServerlessBuildPoll,
  now: number,
  last?: TwilioServerlessRead<TwilioServerlessBuild> | TwilioFailure,
): TwilioServerlessBuildStep {
  const intervalMs = poll.intervalMs ?? TWILIO_SERVERLESS_BUILD_POLL.intervalMs;
  const timeoutMs = poll.timeoutMs ?? TWILIO_SERVERLESS_BUILD_POLL.timeoutMs;
  if (!(Number.isFinite(intervalMs) && intervalMs > 0)) throw new Error("The interval of the poll is not a time above 0.");
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) throw new Error("The time limit of the poll is not a time above 0.");
  if (!(Number.isFinite(now) && Number.isFinite(poll.startedAt))) throw new Error("The time now or the start of the poll is not a finite time.");
  const request = twilioServerlessBuildStatusRequest(credentials, poll.serviceSid, poll.buildSid);
  if (last?.ok === true) {
    if (last.sid !== poll.buildSid) throw new Error("The last read is of another build.");
    if (last.status === "completed") return { step: "done", last };
    if (last.status === "failed") return { step: "failed", last };
  } else if (last !== undefined && (last.kind === "auth" || last.kind === "refused")) {
    return { step: "failed", last };
  }
  const elapsedMs = now - poll.startedAt;
  if (elapsedMs >= timeoutMs) return { step: "timed-out", elapsedMs, ...some("last", last) };
  const waitMs = last === undefined ? 0 : last.ok ? intervalMs : Math.max(intervalMs, last.retryAfterMs ?? 0);
  return { step: "poll", waitMs: Math.min(waitMs, timeoutMs - elapsedMs), request };
}

// =============================================================================
// Extractors
// =============================================================================

type Reader<Item> = (body: Body) => Item | undefined;

const isBody = (value: unknown): value is Body => typeof value === "object" && value !== null && !Array.isArray(value);
const sidOf = (value: unknown, prefix: Prefix): string | undefined => {
  const found = text(value);
  return found !== undefined && SID[prefix].test(found) ? found : undefined;
};
const flag = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);
const dates = (body: Body): { readonly createdAt?: number; readonly updatedAt?: number } => ({
  ...some("createdAt", date(body["date_created"])),
  ...some("updatedAt", date(body["date_updated"])),
});

const readService: Reader<TwilioServerlessService> = (body) => {
  const sid = sidOf(body["sid"], "ZS");
  const uniqueName = text(body["unique_name"]);
  if (sid === undefined || uniqueName === undefined) return undefined;
  return {
    sid,
    uniqueName,
    ...some("friendlyName", text(body["friendly_name"])),
    ...some("includeCredentials", flag(body["include_credentials"])),
    ...some("uiEditable", flag(body["ui_editable"])),
    ...some("domainBase", text(body["domain_base"])),
    ...dates(body),
  };
};

const readResource: Reader<TwilioServerlessResource> = (body) => {
  const sid = sidOf(body["sid"], "ZH");
  const serviceSid = sidOf(body["service_sid"], "ZS");
  if (sid === undefined || serviceSid === undefined) return undefined;
  return { sid, serviceSid, ...some("friendlyName", text(body["friendly_name"])), ...dates(body) };
};

const readVersion: Reader<TwilioServerlessVersion> = (body) => {
  const sid = sidOf(body["sid"], "ZN");
  const serviceSid = sidOf(body["service_sid"], "ZS");
  const resourceSid = sidOf(body["function_sid"], "ZH") ?? sidOf(body["asset_sid"], "ZH");
  const path = text(body["path"]);
  const visibility = text(body["visibility"]);
  if (sid === undefined || serviceSid === undefined || resourceSid === undefined || path === undefined || visibility === undefined || !VISIBILITIES.has(visibility)) {
    return undefined;
  }
  return { sid, serviceSid, resourceSid, path, visibility: visibility as TwilioServerlessVisibility, ...some("createdAt", date(body["date_created"])) };
};

const readBuild: Reader<TwilioServerlessBuild> = (body) => {
  const sid = sidOf(body["sid"], "ZB");
  const serviceSid = sidOf(body["service_sid"], "ZS");
  const status = text(body["status"]);
  if (sid === undefined || serviceSid === undefined || status === undefined) return undefined;
  return { sid, serviceSid, status, ...some("runtime", text(body["runtime"])), ...dates(body) };
};

const readEnvironment: Reader<TwilioServerlessEnvironment> = (body) => {
  const sid = sidOf(body["sid"], "ZE");
  const serviceSid = sidOf(body["service_sid"], "ZS");
  const uniqueName = text(body["unique_name"]);
  const domainName = text(body["domain_name"]);
  if (sid === undefined || serviceSid === undefined || uniqueName === undefined || domainName === undefined) return undefined;
  return {
    sid,
    serviceSid,
    uniqueName,
    domainName,
    ...some("domainSuffix", text(body["domain_suffix"])),
    ...some("buildSid", sidOf(body["build_sid"], "ZB")),
    ...dates(body),
  };
};

const readVariable: Reader<TwilioServerlessVariable> = (body) => {
  const sid = sidOf(body["sid"], "ZV");
  const serviceSid = sidOf(body["service_sid"], "ZS");
  const environmentSid = sidOf(body["environment_sid"], "ZE");
  const key = text(body["key"]);
  const value = body["value"];
  if (sid === undefined || serviceSid === undefined || environmentSid === undefined || key === undefined || typeof value !== "string") return undefined;
  return { sid, serviceSid, environmentSid, key, value, ...dates(body) };
};

const readDeployment: Reader<TwilioServerlessDeployment> = (body) => {
  const sid = sidOf(body["sid"], "ZD");
  const serviceSid = sidOf(body["service_sid"], "ZS");
  const environmentSid = sidOf(body["environment_sid"], "ZE");
  if (sid === undefined || serviceSid === undefined || environmentSid === undefined) return undefined;
  return { sid, serviceSid, environmentSid, ...some("buildSid", sidOf(body["build_sid"], "ZB")), ...dates(body) };
};

function one<Item>(response: TwilioResponse, read: Reader<Item>, what: string): TwilioServerlessRead<Item> | TwilioFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const item = read(sorted.body);
  if (item === undefined) return failure("server", response, undefined, `The answer of Twilio is not ${what}.`);
  return { ok: true, ...item };
}

function page<Item>(response: TwilioResponse, key: string, read: Reader<Item>, what: string): TwilioServerlessPage<Item> | TwilioFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const entries = sorted.body[key];
  if (!Array.isArray(entries)) return failure("server", response, undefined, `The answer of Twilio has no list ${key}.`);
  const items: Item[] = [];
  for (const entry of entries as readonly unknown[]) {
    const item = isBody(entry) ? read(entry) : undefined;
    if (item === undefined) return failure("server", response, undefined, `An item of the list ${key} is not ${what}.`);
    items.push(item);
  }
  const meta = sorted.body["meta"];
  return { ok: true, items, ...some("nextPageUrl", isBody(meta) ? text(meta["next_page_url"]) : undefined) };
}

/** This function reads the response of `twilioServerlessServiceRequest` or `twilioServerlessServiceFetchRequest`. It does not throw. */
export function extractTwilioServerlessService(response: TwilioResponse): TwilioServerlessRead<TwilioServerlessService> | TwilioFailure {
  return one(response, readService, "a service");
}

/** This function reads the response of `twilioServerlessFunctionRequest` or `twilioServerlessAssetRequest`. It does not throw. */
export function extractTwilioServerlessResource(response: TwilioResponse): TwilioServerlessRead<TwilioServerlessResource> | TwilioFailure {
  return one(response, readResource, "a function or an asset");
}

/** This function reads one page of `twilioServerlessFunctionListRequest`. It does not throw. */
export function extractTwilioServerlessFunctions(response: TwilioResponse): TwilioServerlessPage<TwilioServerlessResource> | TwilioFailure {
  return page(response, "functions", readResource, "a function");
}

/** This function reads one page of `twilioServerlessAssetListRequest`. It does not throw. */
export function extractTwilioServerlessAssets(response: TwilioResponse): TwilioServerlessPage<TwilioServerlessResource> | TwilioFailure {
  return page(response, "assets", readResource, "an asset");
}

/** This function reads the response of `twilioServerlessFunctionVersionRequest` or `twilioServerlessAssetVersionRequest`. It does not throw. */
export function extractTwilioServerlessVersion(response: TwilioResponse): TwilioServerlessRead<TwilioServerlessVersion> | TwilioFailure {
  return one(response, readVersion, "a version");
}

/** This function reads the response of `twilioServerlessBuildRequest` or `twilioServerlessBuildStatusRequest`. It does not throw. */
export function extractTwilioServerlessBuild(response: TwilioResponse): TwilioServerlessRead<TwilioServerlessBuild> | TwilioFailure {
  return one(response, readBuild, "a build");
}

/** This function reads the response of `twilioServerlessEnvironmentRequest`. It does not throw. */
export function extractTwilioServerlessEnvironment(response: TwilioResponse): TwilioServerlessRead<TwilioServerlessEnvironment> | TwilioFailure {
  return one(response, readEnvironment, "an environment");
}

/** This function reads one page of `twilioServerlessEnvironmentListRequest`. It does not throw. */
export function extractTwilioServerlessEnvironments(response: TwilioResponse): TwilioServerlessPage<TwilioServerlessEnvironment> | TwilioFailure {
  return page(response, "environments", readEnvironment, "an environment");
}

/** This function reads the response of `twilioServerlessVariableRequest` or `twilioServerlessVariableUpdateRequest`. It does not throw. */
export function extractTwilioServerlessVariable(response: TwilioResponse): TwilioServerlessRead<TwilioServerlessVariable> | TwilioFailure {
  return one(response, readVariable, "a variable");
}

/** This function reads one page of `twilioServerlessVariableListRequest`. It does not throw. */
export function extractTwilioServerlessVariables(response: TwilioResponse): TwilioServerlessPage<TwilioServerlessVariable> | TwilioFailure {
  return page(response, "variables", readVariable, "a variable");
}

/** This function reads the response of `twilioServerlessDeploymentRequest`. It does not throw. */
export function extractTwilioServerlessDeployment(response: TwilioResponse): TwilioServerlessRead<TwilioServerlessDeployment> | TwilioFailure {
  return one(response, readDeployment, "a deployment");
}
