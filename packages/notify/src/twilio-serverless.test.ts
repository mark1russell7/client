import { describe, expect, it } from "vitest";
import { callTwilio, type TwilioCredentials, type TwilioFailure, type TwilioFetch, type TwilioRequest } from "./twilio.js";
import {
  TWILIO_SERVERLESS_API,
  TWILIO_SERVERLESS_BUILD_POLL,
  TWILIO_SERVERLESS_LIMITS,
  TWILIO_SERVERLESS_UPLOAD_API,
  extractTwilioServerlessAssets,
  extractTwilioServerlessBuild,
  extractTwilioServerlessDeployment,
  extractTwilioServerlessEnvironment,
  extractTwilioServerlessEnvironments,
  extractTwilioServerlessFunctions,
  extractTwilioServerlessResource,
  extractTwilioServerlessService,
  extractTwilioServerlessVariable,
  extractTwilioServerlessVariables,
  extractTwilioServerlessVersion,
  twilioServerlessAssetListRequest,
  twilioServerlessAssetRequest,
  twilioServerlessAssetVersionRequest,
  twilioServerlessBuildRequest,
  twilioServerlessBuildStatusRequest,
  twilioServerlessBuildStep,
  twilioServerlessDeploymentRequest,
  twilioServerlessEnvironmentListRequest,
  twilioServerlessEnvironmentRequest,
  twilioServerlessFunctionListRequest,
  twilioServerlessFunctionRequest,
  twilioServerlessFunctionVersionRequest,
  twilioServerlessNextPageRequest,
  twilioServerlessServiceFetchRequest,
  twilioServerlessServiceRequest,
  twilioServerlessVariableListRequest,
  twilioServerlessVariableRequest,
  twilioServerlessVariableUpdateRequest,
  type TwilioServerlessBuild,
  type TwilioServerlessBuildPoll,
  type TwilioServerlessFile,
  type TwilioServerlessRead,
} from "./twilio-serverless.js";

// The keys and the SIDs are made up. Each recorded shape has the keys of the example of its page of
// the Twilio docs, read on 2026-11-16, with made-up values:
// - service: twilio.com/docs/serverless/api/resource/service
// - function: twilio.com/docs/serverless/api/resource/function
// - function version: twilio.com/docs/serverless/api/resource/function-version
// - asset: twilio.com/docs/serverless/api/resource/asset
// - asset version: twilio.com/docs/serverless/api/resource/asset-version
// - build: twilio.com/docs/serverless/api/resource/build
// - build status: the schema serverless.v1.service.build.build_status of the OpenAPI file of Twilio
//   (github.com/twilio/twilio-oai, spec/json/twilio_serverless_v1.json). The docs have no example.
// - environment: twilio.com/docs/serverless/api/resource/environment
// - variable: twilio.com/docs/serverless/api/resource/variable
// - deployment: twilio.com/docs/serverless/api/resource/deployment
// - the meta object of each list: the same pages, and the OpenAPI file.
const ACCOUNT = `AC${"0".repeat(32)}`;
const KEY = `SK${"1".repeat(32)}`;
const SECRET = "madeupsecret00000000000000000000";
const SERVICE = `ZS${"0".repeat(32)}`;
const FUNCTION = `ZH${"1".repeat(32)}`;
const ASSET = `ZH${"2".repeat(32)}`;
const FUNCTION_VERSION = `ZN${"3".repeat(32)}`;
const ASSET_VERSION = `ZN${"4".repeat(32)}`;
const BUILD = `ZB${"5".repeat(32)}`;
const ENVIRONMENT = `ZE${"6".repeat(32)}`;
const VARIABLE = `ZV${"7".repeat(32)}`;
const DEPLOYMENT = `ZD${"8".repeat(32)}`;
const CREDENTIALS: TwilioCredentials = { accountSid: ACCOUNT, secret: SECRET };

const SERVICE_URL = `${TWILIO_SERVERLESS_API}/Services/${SERVICE}`;
const ENVIRONMENT_URL = `${SERVICE_URL}/Environments/${ENVIRONMENT}`;
const CREATED = "2026-11-10T20:00:00Z";
const UPDATED = "2026-11-10T20:00:05Z";

const form = (body: string | undefined): URLSearchParams => new URLSearchParams(body ?? "");
const basic = (user: string, secret: string): string => `Basic ${Buffer.from(`${user}:${secret}`).toString("base64")}`;
const ok = (body: unknown, status = 201) => ({ status, text: JSON.stringify(body) });
const error = (status: number, code: number, message: string) => ({
  status,
  text: JSON.stringify({ code, message, more_info: `https://www.twilio.com/docs/errors/${code}`, status }),
});
const meta = (key: string, url: string, next: string | null = null) => ({
  first_page_url: `${url}?PageSize=50&Page=0`,
  key,
  next_page_url: next,
  page: 0,
  page_size: 50,
  previous_page_url: null,
  url: `${url}?PageSize=50&Page=0`,
});

const SERVICE_BODY = {
  sid: SERVICE,
  account_sid: ACCOUNT,
  friendly_name: "A test app",
  unique_name: "test-app",
  include_credentials: true,
  ui_editable: false,
  domain_base: "test-app-1234",
  date_created: CREATED,
  date_updated: UPDATED,
  url: SERVICE_URL,
  links: { environments: `${SERVICE_URL}/Environments`, functions: `${SERVICE_URL}/Functions`, assets: `${SERVICE_URL}/Assets`, builds: `${SERVICE_URL}/Builds` },
};

const FUNCTION_BODY = {
  sid: FUNCTION,
  account_sid: ACCOUNT,
  service_sid: SERVICE,
  friendly_name: "call",
  date_created: CREATED,
  date_updated: UPDATED,
  url: `${SERVICE_URL}/Functions/${FUNCTION}`,
  links: { function_versions: `${SERVICE_URL}/Functions/${FUNCTION}/Versions` },
};

const ASSET_BODY = {
  sid: ASSET,
  account_sid: ACCOUNT,
  service_sid: SERVICE,
  friendly_name: "list",
  date_created: CREATED,
  date_updated: UPDATED,
  url: `${SERVICE_URL}/Assets/${ASSET}`,
  links: { asset_versions: `${SERVICE_URL}/Assets/${ASSET}/Versions` },
};

const FUNCTION_VERSION_BODY = {
  sid: FUNCTION_VERSION,
  account_sid: ACCOUNT,
  service_sid: SERVICE,
  function_sid: FUNCTION,
  path: "/call",
  visibility: "protected",
  date_created: CREATED,
  url: `${SERVICE_URL}/Functions/${FUNCTION}/Versions/${FUNCTION_VERSION}`,
  links: { function_version_content: `${SERVICE_URL}/Functions/${FUNCTION}/Versions/${FUNCTION_VERSION}/Content` },
};

const ASSET_VERSION_BODY = {
  sid: ASSET_VERSION,
  account_sid: ACCOUNT,
  service_sid: SERVICE,
  asset_sid: ASSET,
  path: "/list.json",
  visibility: "private",
  date_created: CREATED,
  url: `${SERVICE_URL}/Assets/${ASSET}/Versions/${ASSET_VERSION}`,
};

const BUILD_BODY = {
  sid: BUILD,
  account_sid: ACCOUNT,
  service_sid: SERVICE,
  asset_versions: [ASSET_VERSION],
  function_versions: [FUNCTION_VERSION],
  dependencies: '[{"name":"twilio","version":"5.0.0"}]',
  runtime: "node22",
  status: "building",
  date_created: CREATED,
  date_updated: UPDATED,
  url: `${SERVICE_URL}/Builds/${BUILD}`,
  links: { build_status: `${SERVICE_URL}/Builds/${BUILD}/Status` },
};

const statusBody = (status: string) => ({ sid: BUILD, account_sid: ACCOUNT, service_sid: SERVICE, status, url: `${SERVICE_URL}/Builds/${BUILD}/Status` });

const ENVIRONMENT_BODY = {
  sid: ENVIRONMENT,
  account_sid: ACCOUNT,
  service_sid: SERVICE,
  build_sid: null,
  unique_name: "dev",
  domain_suffix: "dev",
  domain_name: "test-app-1234-dev.twil.io",
  date_created: CREATED,
  date_updated: UPDATED,
  url: ENVIRONMENT_URL,
  links: { variables: `${ENVIRONMENT_URL}/Variables`, deployments: `${ENVIRONMENT_URL}/Deployments`, logs: `${ENVIRONMENT_URL}/Logs` },
};

const VARIABLE_BODY = {
  sid: VARIABLE,
  account_sid: ACCOUNT,
  service_sid: SERVICE,
  environment_sid: ENVIRONMENT,
  key: "GATHER_KEY",
  value: "1",
  date_created: CREATED,
  date_updated: UPDATED,
  url: `${ENVIRONMENT_URL}/Variables/${VARIABLE}`,
};

const DEPLOYMENT_BODY = {
  sid: DEPLOYMENT,
  account_sid: ACCOUNT,
  service_sid: SERVICE,
  environment_sid: ENVIRONMENT,
  build_sid: BUILD,
  date_created: CREATED,
  date_updated: UPDATED,
  url: `${ENVIRONMENT_URL}/Deployments/${DEPLOYMENT}`,
};

/** The parts of a multipart body: the headers and the text of each part. */
function partsOf(request: TwilioRequest): { readonly boundary: string; readonly parts: readonly { readonly headers: readonly string[]; readonly text: string }[] } {
  const type = request.headers["content-type"] ?? "";
  const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(type)?.[1];
  if (boundary === undefined || request.body === undefined) throw new Error("The request has no multipart body.");
  const body = request.body;
  expect(body.startsWith(`--${boundary}\r\n`)).toBe(true);
  expect(body.endsWith(`\r\n--${boundary}--\r\n`)).toBe(true);
  const inner = body.slice(`--${boundary}\r\n`.length, body.length - `\r\n--${boundary}--\r\n`.length);
  const parts = inner.split(`\r\n--${boundary}\r\n`).map((part) => {
    const end = part.indexOf("\r\n\r\n");
    return { headers: part.slice(0, end).split("\r\n"), text: part.slice(end + 4) };
  });
  return { boundary, parts };
}

const fileOf = (extra: Partial<TwilioServerlessFile> = {}): TwilioServerlessFile => ({
  path: "/call",
  visibility: "protected",
  content: "exports.handler = (context, event, callback) => callback(null, 'ok');\n",
  ...extra,
});

describe("the requests of a service", () => {
  it("posts a form to the Services resource, with Basic authentication", () => {
    const request = twilioServerlessServiceRequest(CREDENTIALS, { uniqueName: "test-app", friendlyName: "A test app" });
    expect(request.url).toBe(`${TWILIO_SERVERLESS_API}/Services`);
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual({
      authorization: basic(ACCOUNT, SECRET),
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(Object.fromEntries(form(request.body))).toEqual({ UniqueName: "test-app", FriendlyName: "A test app" });
  });

  it("sends the two flags as true or false, and authenticates with an API key", () => {
    const request = twilioServerlessServiceRequest({ accountSid: ACCOUNT, keySid: KEY, secret: SECRET }, {
      uniqueName: "test-app",
      friendlyName: "A test app",
      includeCredentials: false,
      uiEditable: true,
    });
    expect(request.headers["authorization"]).toBe(basic(KEY, SECRET));
    expect(Object.fromEntries(form(request.body))).toEqual({ UniqueName: "test-app", FriendlyName: "A test app", IncludeCredentials: "false", UiEditable: "true" });
  });

  it("reads a service by its SID, or by its unique name in one segment of the path", () => {
    expect(twilioServerlessServiceFetchRequest(CREDENTIALS, SERVICE)).toMatchObject({ url: SERVICE_URL, method: "GET" });
    expect(twilioServerlessServiceFetchRequest(CREDENTIALS, "test app/x").url).toBe(`${TWILIO_SERVERLESS_API}/Services/test%20app%2Fx`);
    expect(twilioServerlessServiceFetchRequest(CREDENTIALS, SERVICE).body).toBeUndefined();
    expect(twilioServerlessServiceFetchRequest(CREDENTIALS, SERVICE).headers["content-type"]).toBeUndefined();
  });

  it.each<[string, () => unknown]>([
    ["an empty unique name", () => twilioServerlessServiceRequest(CREDENTIALS, { uniqueName: " ", friendlyName: "A" })],
    ["a unique name of 51 characters", () => twilioServerlessServiceRequest(CREDENTIALS, { uniqueName: "x".repeat(51), friendlyName: "A" })],
    ["a friendly name of 256 characters", () => twilioServerlessServiceRequest(CREDENTIALS, { uniqueName: "a", friendlyName: "x".repeat(256) })],
    ["a fetch of an empty name", () => twilioServerlessServiceFetchRequest(CREDENTIALS, "")],
    ["a fetch of a dot segment", () => twilioServerlessServiceFetchRequest(CREDENTIALS, "..")],
    ["credentials of the wrong form", () => twilioServerlessServiceFetchRequest({ accountSid: "AC123", secret: SECRET }, SERVICE)],
    ["an API key of the wrong form", () => twilioServerlessServiceFetchRequest({ accountSid: ACCOUNT, keySid: "SK1", secret: SECRET }, SERVICE)],
    ["an empty secret", () => twilioServerlessServiceFetchRequest({ accountSid: ACCOUNT, secret: "" }, SERVICE)],
  ])("throws for %s", (_name, build) => {
    expect(build).toThrow();
  });
});

describe("the requests of functions and assets", () => {
  it("makes a function and an asset with a friendly name", () => {
    const fn = twilioServerlessFunctionRequest(CREDENTIALS, SERVICE, "call");
    expect(fn).toMatchObject({ url: `${SERVICE_URL}/Functions`, method: "POST" });
    expect(Object.fromEntries(form(fn.body))).toEqual({ FriendlyName: "call" });
    const asset = twilioServerlessAssetRequest(CREDENTIALS, SERVICE, "list");
    expect(asset).toMatchObject({ url: `${SERVICE_URL}/Assets`, method: "POST" });
    expect(Object.fromEntries(form(asset.body))).toEqual({ FriendlyName: "list" });
  });

  it("reads the lists, with an optional page size", () => {
    expect(twilioServerlessFunctionListRequest(CREDENTIALS, SERVICE)).toMatchObject({ url: `${SERVICE_URL}/Functions`, method: "GET" });
    expect(twilioServerlessAssetListRequest(CREDENTIALS, SERVICE, { pageSize: 1000 }).url).toBe(`${SERVICE_URL}/Assets?PageSize=1000`);
    expect(twilioServerlessEnvironmentListRequest(CREDENTIALS, SERVICE, { pageSize: 1 }).url).toBe(`${SERVICE_URL}/Environments?PageSize=1`);
    expect(twilioServerlessVariableListRequest(CREDENTIALS, SERVICE, ENVIRONMENT).url).toBe(`${ENVIRONMENT_URL}/Variables`);
  });

  it.each<[string, () => unknown]>([
    ["a service SID of the wrong form", () => twilioServerlessFunctionRequest(CREDENTIALS, `ZH${"0".repeat(32)}`, "call")],
    ["an empty friendly name", () => twilioServerlessAssetRequest(CREDENTIALS, SERVICE, "")],
    ["a page size of 0", () => twilioServerlessFunctionListRequest(CREDENTIALS, SERVICE, { pageSize: 0 })],
    ["a page size of 1001", () => twilioServerlessFunctionListRequest(CREDENTIALS, SERVICE, { pageSize: TWILIO_SERVERLESS_LIMITS.pageSize + 1 })],
    ["a page size that is not an integer", () => twilioServerlessAssetListRequest(CREDENTIALS, SERVICE, { pageSize: 1.5 })],
    ["an environment SID of the wrong form", () => twilioServerlessVariableListRequest(CREDENTIALS, SERVICE, SERVICE)],
  ])("throws for %s", (_name, build) => {
    expect(build).toThrow();
  });
});

describe("the uploads of versions", () => {
  it("posts the code of a function as a multipart body to the upload host", () => {
    const request = twilioServerlessFunctionVersionRequest(CREDENTIALS, SERVICE, FUNCTION, fileOf());
    expect(request.url).toBe(`${TWILIO_SERVERLESS_UPLOAD_API}/Services/${SERVICE}/Functions/${FUNCTION}/Versions`);
    expect(request.method).toBe("POST");
    expect(request.headers["authorization"]).toBe(basic(ACCOUNT, SECRET));
    expect(request.headers["content-type"]).toBe("multipart/form-data; boundary=notify-twilio-serverless-0");
    expect(request.body).toBe(
      [
        "--notify-twilio-serverless-0",
        'Content-Disposition: form-data; name="Path"',
        "",
        "/call",
        "--notify-twilio-serverless-0",
        'Content-Disposition: form-data; name="Visibility"',
        "",
        "protected",
        "--notify-twilio-serverless-0",
        'Content-Disposition: form-data; name="Content"; filename="call"',
        "Content-Type: application/javascript",
        "",
        "exports.handler = (context, event, callback) => callback(null, 'ok');\n",
        "--notify-twilio-serverless-0--",
        "",
      ].join("\r\n"),
    );
  });

  it("gives the same body for the same input", () => {
    const one = twilioServerlessFunctionVersionRequest(CREDENTIALS, SERVICE, FUNCTION, fileOf());
    const two = twilioServerlessFunctionVersionRequest(CREDENTIALS, SERVICE, FUNCTION, fileOf());
    expect(two).toEqual(one);
  });

  it("posts the content of an asset as JSON, and keeps each character of the content", () => {
    const content = `${JSON.stringify({ items: ["a", "é", "€"], note: 'quote " and line\r\nend' }, null, 2)}\n`;
    const request = twilioServerlessAssetVersionRequest(CREDENTIALS, SERVICE, ASSET, { path: "/list.json", visibility: "private", content });
    expect(request.url).toBe(`${TWILIO_SERVERLESS_UPLOAD_API}/Services/${SERVICE}/Assets/${ASSET}/Versions`);
    const { parts } = partsOf(request);
    expect(parts.map((part) => part.text)).toEqual(["/list.json", "private", content]);
    expect(parts[2]?.headers).toEqual(['Content-Disposition: form-data; name="Content"; filename="list.json"', "Content-Type: application/json"]);
  });

  it("takes the next boundary when the content has the text of a boundary", () => {
    const content = "a line with --notify-twilio-serverless-0 and notify-twilio-serverless-1 in it";
    const request = twilioServerlessAssetVersionRequest(CREDENTIALS, SERVICE, ASSET, { path: "/note.txt", visibility: "public", content, contentType: "text/plain" });
    const { boundary, parts } = partsOf(request);
    expect(boundary).toBe("notify-twilio-serverless-2");
    expect(parts.map((part) => part.text)).toEqual(["/note.txt", "public", content]);
    expect(parts[2]?.headers[1]).toBe("Content-Type: text/plain");
  });

  it("gives a safe file name from the last segment of the path", () => {
    const request = twilioServerlessAssetVersionRequest(CREDENTIALS, SERVICE, ASSET, { path: "/a/b%20c'd.json", visibility: "public", content: "{}" });
    expect(partsOf(request).parts[2]?.headers[0]).toBe('Content-Disposition: form-data; name="Content"; filename="b_20c_d.json"');
    const root = twilioServerlessAssetVersionRequest(CREDENTIALS, SERVICE, ASSET, { path: "/", visibility: "public", content: "{}" });
    expect(partsOf(root).parts[2]?.headers[0]).toBe('Content-Disposition: form-data; name="Content"; filename="content"');
  });

  it.each<[string, Partial<TwilioServerlessFile>]>([
    ["a path without a slash at the start", { path: "call" }],
    ["a path with a space", { path: "/a call" }],
    ["a path with a line end", { path: "/call\r\nX: y" }],
    ["a path with a quotation mark", { path: '/call"' }],
    ["a path of 256 characters", { path: `/${"x".repeat(TWILIO_SERVERLESS_LIMITS.path)}` }],
    ["a visibility that is not of Twilio", { visibility: "secret" as never }],
    ["a content type with a line end", { contentType: "application/json\r\nX-Other: 1" }],
    ["a content type that is not a media type", { contentType: "json" }],
  ])("throws for %s", (_name, extra) => {
    expect(() => twilioServerlessFunctionVersionRequest(CREDENTIALS, SERVICE, FUNCTION, fileOf(extra))).toThrow();
  });

  it("accepts a path of 255 characters", () => {
    expect(() => twilioServerlessFunctionVersionRequest(CREDENTIALS, SERVICE, FUNCTION, fileOf({ path: `/${"x".repeat(254)}` }))).not.toThrow();
  });

  it("throws for a function SID or an asset SID of the wrong form", () => {
    expect(() => twilioServerlessFunctionVersionRequest(CREDENTIALS, SERVICE, FUNCTION_VERSION, fileOf())).toThrow();
    expect(() => twilioServerlessAssetVersionRequest(CREDENTIALS, SERVICE, "ZH1", fileOf())).toThrow();
  });
});

describe("the requests of a build", () => {
  it("repeats the field of each version, and gives the dependencies as JSON text", () => {
    const request = twilioServerlessBuildRequest(CREDENTIALS, SERVICE, {
      functionVersions: [FUNCTION_VERSION, `ZN${"9".repeat(32)}`],
      assetVersions: [ASSET_VERSION],
      dependencies: { twilio: "5.0.0", "@twilio/runtime-handler": "2.0.0" },
      runtime: "node22",
    });
    expect(request).toMatchObject({ url: `${SERVICE_URL}/Builds`, method: "POST" });
    const fields = form(request.body);
    expect(fields.getAll("FunctionVersions")).toEqual([FUNCTION_VERSION, `ZN${"9".repeat(32)}`]);
    expect(fields.getAll("AssetVersions")).toEqual([ASSET_VERSION]);
    expect(fields.get("Dependencies")).toBe('[{"name":"twilio","version":"5.0.0"},{"name":"@twilio/runtime-handler","version":"2.0.0"}]');
    expect(fields.get("Runtime")).toBe("node22");
  });

  it("sends only the fields of the input", () => {
    const fields = form(twilioServerlessBuildRequest(CREDENTIALS, SERVICE, { assetVersions: [ASSET_VERSION] }).body);
    expect([...fields.keys()]).toEqual(["AssetVersions"]);
  });

  it("reads the status of a build", () => {
    expect(twilioServerlessBuildStatusRequest(CREDENTIALS, SERVICE, BUILD)).toMatchObject({ url: `${SERVICE_URL}/Builds/${BUILD}/Status`, method: "GET" });
  });

  it.each<[string, () => unknown]>([
    ["no version", () => twilioServerlessBuildRequest(CREDENTIALS, SERVICE, { functionVersions: [], dependencies: { twilio: "5.0.0" } })],
    ["a version SID of the wrong form", () => twilioServerlessBuildRequest(CREDENTIALS, SERVICE, { functionVersions: [FUNCTION] })],
    ["a runtime that is not node and a version", () => twilioServerlessBuildRequest(CREDENTIALS, SERVICE, { functionVersions: [FUNCTION_VERSION], runtime: "deno2" })],
    ["a dependency without a version", () => twilioServerlessBuildRequest(CREDENTIALS, SERVICE, { functionVersions: [FUNCTION_VERSION], dependencies: { twilio: " " } })],
    ["a status read of a build SID of the wrong form", () => twilioServerlessBuildStatusRequest(CREDENTIALS, SERVICE, DEPLOYMENT)],
  ])("throws for %s", (_name, build) => {
    expect(build).toThrow();
  });
});

describe("the requests of environments, variables and deployments", () => {
  it("makes an environment with a unique name and a domain suffix", () => {
    const request = twilioServerlessEnvironmentRequest(CREDENTIALS, SERVICE, { uniqueName: "dev", domainSuffix: "dev" });
    expect(request).toMatchObject({ url: `${SERVICE_URL}/Environments`, method: "POST" });
    expect(Object.fromEntries(form(request.body))).toEqual({ UniqueName: "dev", DomainSuffix: "dev" });
    expect(Object.fromEntries(form(twilioServerlessEnvironmentRequest(CREDENTIALS, SERVICE, { uniqueName: "prod" }).body))).toEqual({ UniqueName: "prod" });
  });

  it("makes a variable and changes its value", () => {
    const create = twilioServerlessVariableRequest(CREDENTIALS, SERVICE, ENVIRONMENT, { key: "GATHER_KEY", value: "1 & 2 = 3" });
    expect(create).toMatchObject({ url: `${ENVIRONMENT_URL}/Variables`, method: "POST" });
    expect(Object.fromEntries(form(create.body))).toEqual({ Key: "GATHER_KEY", Value: "1 & 2 = 3" });
    const update = twilioServerlessVariableUpdateRequest(CREDENTIALS, SERVICE, ENVIRONMENT, VARIABLE, "2");
    expect(update).toMatchObject({ url: `${ENVIRONMENT_URL}/Variables/${VARIABLE}`, method: "POST" });
    expect(Object.fromEntries(form(update.body))).toEqual({ Value: "2" });
  });

  it("counts the value of a variable in bytes of UTF-8, and keeps the value out of the error", () => {
    const value = "€".repeat(151); // 151 characters, 453 bytes
    expect(() => twilioServerlessVariableRequest(CREDENTIALS, SERVICE, ENVIRONMENT, { key: "K", value: "€".repeat(150) })).not.toThrow();
    let message = "";
    try {
      twilioServerlessVariableUpdateRequest(CREDENTIALS, SERVICE, ENVIRONMENT, VARIABLE, value);
    } catch (thrown) {
      message = (thrown as Error).message;
    }
    expect(message).toContain("450 bytes");
    expect(message).not.toContain("€");
  });

  it("deploys a build to an environment", () => {
    const request = twilioServerlessDeploymentRequest(CREDENTIALS, SERVICE, ENVIRONMENT, BUILD);
    expect(request).toMatchObject({ url: `${ENVIRONMENT_URL}/Deployments`, method: "POST" });
    expect(Object.fromEntries(form(request.body))).toEqual({ BuildSid: BUILD });
  });

  it.each<[string, () => unknown]>([
    ["an environment name of 101 characters", () => twilioServerlessEnvironmentRequest(CREDENTIALS, SERVICE, { uniqueName: "x".repeat(101) })],
    ["a domain suffix of 17 characters", () => twilioServerlessEnvironmentRequest(CREDENTIALS, SERVICE, { uniqueName: "dev", domainSuffix: "x".repeat(17) })],
    ["a domain suffix with a dot", () => twilioServerlessEnvironmentRequest(CREDENTIALS, SERVICE, { uniqueName: "dev", domainSuffix: "a.b" })],
    ["an empty domain suffix", () => twilioServerlessEnvironmentRequest(CREDENTIALS, SERVICE, { uniqueName: "dev", domainSuffix: "" })],
    ["an empty key", () => twilioServerlessVariableRequest(CREDENTIALS, SERVICE, ENVIRONMENT, { key: "", value: "1" })],
    ["a key of 129 characters", () => twilioServerlessVariableRequest(CREDENTIALS, SERVICE, ENVIRONMENT, { key: "K".repeat(129), value: "1" })],
    ["a variable SID of the wrong form", () => twilioServerlessVariableUpdateRequest(CREDENTIALS, SERVICE, ENVIRONMENT, ENVIRONMENT, "1")],
    ["a deployment of a SID that is not a build", () => twilioServerlessDeploymentRequest(CREDENTIALS, SERVICE, ENVIRONMENT, DEPLOYMENT)],
  ])("throws for %s", (_name, build) => {
    expect(build).toThrow();
  });
});

/** This function gives the address with a user name in it. */
function withUser(address: string): string {
  const url = new URL(address);
  url.username = "x";
  return url.href;
}

describe("twilioServerlessNextPageRequest", () => {
  it("reads the next page of the Serverless API", () => {
    const next = `${SERVICE_URL}/Functions?PageSize=50&Page=1&PageToken=PAmadeup`;
    expect(twilioServerlessNextPageRequest(CREDENTIALS, next)).toMatchObject({ url: next, method: "GET" });
  });

  it.each([
    ["another host", "https://example.com/v1/Services"],
    ["a host that starts with the host of Twilio", "https://serverless.twilio.com.example.com/v1/Services"],
    ["http", "http://serverless.twilio.com/v1/Services"],
    ["another port", "https://serverless.twilio.com:8443/v1/Services"],
    ["a user in the address", withUser(`${TWILIO_SERVERLESS_API}/Services`)],
    ["another version", "https://serverless.twilio.com/v2/Services"],
    ["the upload host", `${TWILIO_SERVERLESS_UPLOAD_API}/Services`],
    ["a text that is not an address", "next page"],
  ])("throws for %s", (_name, url) => {
    expect(() => twilioServerlessNextPageRequest(CREDENTIALS, url)).toThrow();
  });
});

describe("twilioServerlessBuildStep", () => {
  const POLL: TwilioServerlessBuildPoll = { serviceSid: SERVICE, buildSid: BUILD, startedAt: 1_000_000 };
  const read = (status: string): TwilioServerlessRead<TwilioServerlessBuild> => ({ ok: true, sid: BUILD, serviceSid: SERVICE, status });
  const lost = (kind: TwilioFailure["kind"], retryAfterMs?: number): TwilioFailure => ({
    ok: false,
    kind,
    status: 0,
    errors: ["made up"],
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });

  it("reads the status at once without a last read", () => {
    const step = twilioServerlessBuildStep(CREDENTIALS, POLL, POLL.startedAt);
    expect(step).toEqual({ step: "poll", waitMs: 0, request: twilioServerlessBuildStatusRequest(CREDENTIALS, SERVICE, BUILD) });
  });

  it("waits the interval after a read of building, and after an unknown status", () => {
    expect(twilioServerlessBuildStep(CREDENTIALS, POLL, POLL.startedAt + 10, read("building"))).toMatchObject({ step: "poll", waitMs: TWILIO_SERVERLESS_BUILD_POLL.intervalMs });
    expect(twilioServerlessBuildStep(CREDENTIALS, { ...POLL, intervalMs: 750 }, POLL.startedAt, read("queued"))).toMatchObject({ step: "poll", waitMs: 750 });
  });

  it("ends as done after completed, and as failed after failed", () => {
    expect(twilioServerlessBuildStep(CREDENTIALS, POLL, POLL.startedAt, read("completed"))).toEqual({ step: "done", last: read("completed") });
    expect(twilioServerlessBuildStep(CREDENTIALS, POLL, POLL.startedAt, read("failed"))).toEqual({ step: "failed", last: read("failed") });
  });

  it("gives done after the time limit when the last read is completed", () => {
    expect(twilioServerlessBuildStep(CREDENTIALS, POLL, POLL.startedAt + 10 * TWILIO_SERVERLESS_BUILD_POLL.timeoutMs, read("completed"))).toMatchObject({ step: "done" });
  });

  it("waits the longer of the interval and retryAfterMs after a failure that can go again", () => {
    expect(twilioServerlessBuildStep(CREDENTIALS, POLL, POLL.startedAt, lost("rate-limited", 7_000))).toMatchObject({ step: "poll", waitMs: 7_000 });
    expect(twilioServerlessBuildStep(CREDENTIALS, { ...POLL, intervalMs: 9_000 }, POLL.startedAt, lost("server", 5_000))).toMatchObject({ step: "poll", waitMs: 9_000 });
    expect(twilioServerlessBuildStep(CREDENTIALS, POLL, POLL.startedAt, lost("network"))).toMatchObject({ step: "poll", waitMs: TWILIO_SERVERLESS_BUILD_POLL.intervalMs });
  });

  it.each(["auth", "refused"] as const)("ends as failed after a failure of the kind %s", (kind) => {
    expect(twilioServerlessBuildStep(CREDENTIALS, POLL, POLL.startedAt, lost(kind))).toEqual({ step: "failed", last: lost(kind) });
  });

  it("ends the last wait at the time limit, then gives timed-out with the last read", () => {
    const poll = { ...POLL, intervalMs: 2_000, timeoutMs: 10_000 };
    expect(twilioServerlessBuildStep(CREDENTIALS, poll, POLL.startedAt + 9_500, read("building"))).toMatchObject({ step: "poll", waitMs: 500 });
    expect(twilioServerlessBuildStep(CREDENTIALS, poll, POLL.startedAt + 10_000, read("building"))).toEqual({ step: "timed-out", elapsedMs: 10_000, last: read("building") });
    expect(twilioServerlessBuildStep(CREDENTIALS, poll, POLL.startedAt + 12_000)).toEqual({ step: "timed-out", elapsedMs: 12_000 });
  });

  it("runs a whole poll on a test clock to done", () => {
    const answers = [statusBody("building"), statusBody("building"), statusBody("completed")];
    const sent: string[] = [];
    let now = POLL.startedAt;
    let last: TwilioServerlessRead<TwilioServerlessBuild> | TwilioFailure | undefined = extractTwilioServerlessBuild(ok(BUILD_BODY));
    for (let count = 0; count < 10; count += 1) {
      const step = twilioServerlessBuildStep(CREDENTIALS, POLL, now, last);
      if (step.step !== "poll") {
        expect(step).toMatchObject({ step: "done", last: { sid: BUILD, status: "completed" } });
        expect(sent).toHaveLength(3);
        expect(now - POLL.startedAt).toBe(3 * TWILIO_SERVERLESS_BUILD_POLL.intervalMs);
        return;
      }
      now += step.waitMs;
      sent.push(step.request.url);
      last = extractTwilioServerlessBuild(ok(answers.shift(), 200));
    }
    throw new Error("The poll did not end.");
  });

  it.each<[string, Partial<TwilioServerlessBuildPoll>, unknown]>([
    ["an interval of 0", { intervalMs: 0 }, undefined],
    ["a time limit that is not finite", { timeoutMs: Number.POSITIVE_INFINITY }, undefined],
    ["a start that is not a number", { startedAt: Number.NaN }, undefined],
    ["a build SID of the wrong form", { buildSid: "ZB1" }, undefined],
    ["a last read of another build", {}, { ok: true, sid: `ZB${"a".repeat(32)}`, serviceSid: SERVICE, status: "completed" }],
  ])("throws for %s", (_name, extra, last) => {
    expect(() => twilioServerlessBuildStep(CREDENTIALS, { ...POLL, ...extra }, POLL.startedAt, last as TwilioServerlessRead<TwilioServerlessBuild> | undefined)).toThrow();
  });
});

describe("the extractors", () => {
  const at = (value: string): number => Date.parse(value);

  it("reads a service", () => {
    expect(extractTwilioServerlessService(ok(SERVICE_BODY, 200))).toEqual({
      ok: true,
      sid: SERVICE,
      uniqueName: "test-app",
      friendlyName: "A test app",
      includeCredentials: true,
      uiEditable: false,
      domainBase: "test-app-1234",
      createdAt: at(CREATED),
      updatedAt: at(UPDATED),
    });
  });

  it("reads a function and an asset", () => {
    expect(extractTwilioServerlessResource(ok(FUNCTION_BODY))).toEqual({ ok: true, sid: FUNCTION, serviceSid: SERVICE, friendlyName: "call", createdAt: at(CREATED), updatedAt: at(UPDATED) });
    expect(extractTwilioServerlessResource(ok(ASSET_BODY))).toMatchObject({ ok: true, sid: ASSET, friendlyName: "list" });
  });

  it("reads a function version and an asset version", () => {
    expect(extractTwilioServerlessVersion(ok(FUNCTION_VERSION_BODY))).toEqual({
      ok: true,
      sid: FUNCTION_VERSION,
      serviceSid: SERVICE,
      resourceSid: FUNCTION,
      path: "/call",
      visibility: "protected",
      createdAt: at(CREATED),
    });
    expect(extractTwilioServerlessVersion(ok(ASSET_VERSION_BODY))).toMatchObject({ ok: true, sid: ASSET_VERSION, resourceSid: ASSET, path: "/list.json", visibility: "private" });
  });

  it("reads a build and the status of a build", () => {
    expect(extractTwilioServerlessBuild(ok(BUILD_BODY))).toEqual({
      ok: true,
      sid: BUILD,
      serviceSid: SERVICE,
      status: "building",
      runtime: "node22",
      createdAt: at(CREATED),
      updatedAt: at(UPDATED),
    });
    expect(extractTwilioServerlessBuild(ok(statusBody("completed"), 200))).toEqual({ ok: true, sid: BUILD, serviceSid: SERVICE, status: "completed" });
  });

  it("reads an environment, its domain name and the build of its last deployment", () => {
    expect(extractTwilioServerlessEnvironment(ok(ENVIRONMENT_BODY))).toEqual({
      ok: true,
      sid: ENVIRONMENT,
      serviceSid: SERVICE,
      uniqueName: "dev",
      domainName: "test-app-1234-dev.twil.io",
      domainSuffix: "dev",
      createdAt: at(CREATED),
      updatedAt: at(UPDATED),
    });
    expect(extractTwilioServerlessEnvironment(ok({ ...ENVIRONMENT_BODY, build_sid: BUILD }, 200))).toMatchObject({ buildSid: BUILD });
  });

  it("reads a variable, also with an empty value", () => {
    expect(extractTwilioServerlessVariable(ok(VARIABLE_BODY))).toEqual({
      ok: true,
      sid: VARIABLE,
      serviceSid: SERVICE,
      environmentSid: ENVIRONMENT,
      key: "GATHER_KEY",
      value: "1",
      createdAt: at(CREATED),
      updatedAt: at(UPDATED),
    });
    expect(extractTwilioServerlessVariable(ok({ ...VARIABLE_BODY, value: "" }, 200))).toMatchObject({ ok: true, value: "" });
  });

  it("reads a deployment", () => {
    expect(extractTwilioServerlessDeployment(ok(DEPLOYMENT_BODY))).toEqual({
      ok: true,
      sid: DEPLOYMENT,
      serviceSid: SERVICE,
      environmentSid: ENVIRONMENT,
      buildSid: BUILD,
      createdAt: at(CREATED),
      updatedAt: at(UPDATED),
    });
  });

  it("reads the pages of each list, and the address of the next page", () => {
    const next = `${SERVICE_URL}/Functions?PageSize=50&Page=1&PageToken=PAmadeup`;
    const functions = extractTwilioServerlessFunctions(ok({ functions: [FUNCTION_BODY], meta: meta("functions", `${SERVICE_URL}/Functions`, next) }, 200));
    expect(functions).toEqual({ ok: true, items: [{ sid: FUNCTION, serviceSid: SERVICE, friendlyName: "call", createdAt: at(CREATED), updatedAt: at(UPDATED) }], nextPageUrl: next });
    if (functions.ok && functions.nextPageUrl !== undefined) expect(twilioServerlessNextPageRequest(CREDENTIALS, functions.nextPageUrl).url).toBe(next);
    expect(extractTwilioServerlessAssets(ok({ assets: [ASSET_BODY], meta: meta("assets", `${SERVICE_URL}/Assets`) }, 200))).toMatchObject({ ok: true, items: [{ sid: ASSET }] });
    expect(extractTwilioServerlessEnvironments(ok({ environments: [ENVIRONMENT_BODY], meta: meta("environments", `${SERVICE_URL}/Environments`) }, 200))).toMatchObject({
      ok: true,
      items: [{ sid: ENVIRONMENT, domainName: "test-app-1234-dev.twil.io" }],
    });
    const variables = extractTwilioServerlessVariables(ok({ variables: [VARIABLE_BODY], meta: meta("variables", `${ENVIRONMENT_URL}/Variables`) }, 200));
    expect(variables).toMatchObject({ ok: true, items: [{ sid: VARIABLE, key: "GATHER_KEY" }] });
    expect(variables).not.toHaveProperty("nextPageUrl");
    expect(extractTwilioServerlessFunctions(ok({ functions: [], meta: meta("functions", `${SERVICE_URL}/Functions`) }, 200))).toEqual({ ok: true, items: [] });
  });

  it("gives a failure for a list with an item of the wrong shape, or without its key", () => {
    expect(extractTwilioServerlessFunctions(ok({ functions: [FUNCTION_BODY, { sid: "ZH1" }], meta: meta("functions", SERVICE_URL) }, 200))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioServerlessAssets(ok({ functions: [FUNCTION_BODY], meta: meta("functions", SERVICE_URL) }, 200))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioServerlessVariables(ok({ variables: [null], meta: meta("variables", SERVICE_URL) }, 200))).toMatchObject({ ok: false, kind: "server" });
  });

  it("gives a failure for an answer of the wrong shape", () => {
    expect(extractTwilioServerlessService(ok({ ...SERVICE_BODY, sid: FUNCTION }, 200))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioServerlessVersion(ok({ ...FUNCTION_VERSION_BODY, visibility: "secret" }))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioServerlessEnvironment(ok({ ...ENVIRONMENT_BODY, domain_name: null }))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioServerlessVariable(ok({ ...VARIABLE_BODY, value: 1 }))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioServerlessBuild({ status: 200, text: "not JSON" })).toMatchObject({ ok: false, kind: "server" });
  });

  it("sorts the failures of Twilio by kind, with the code of Twilio", () => {
    const headers = { get: (name: string) => (name.toLowerCase() === "retry-after" ? "12" : null) };
    expect(extractTwilioServerlessService(error(404, 20404, "The requested resource was not found"))).toEqual({
      ok: false,
      kind: "refused",
      status: 404,
      errors: ["The requested resource was not found"],
      code: 20404,
    });
    expect(extractTwilioServerlessBuild(error(401, 20003, "Authenticate"))).toMatchObject({ ok: false, kind: "auth", code: 20003 });
    expect(extractTwilioServerlessBuild({ ...error(429, 20429, "Too Many Requests"), headers })).toMatchObject({ ok: false, kind: "rate-limited", retryAfterMs: 12_000 });
    expect(extractTwilioServerlessDeployment({ status: 503, text: "" })).toMatchObject({ ok: false, kind: "server", retryAfterMs: 5_000 });
  });

  it("does not throw for any body text", () => {
    const extractors = [
      extractTwilioServerlessService,
      extractTwilioServerlessResource,
      extractTwilioServerlessFunctions,
      extractTwilioServerlessAssets,
      extractTwilioServerlessVersion,
      extractTwilioServerlessBuild,
      extractTwilioServerlessEnvironment,
      extractTwilioServerlessEnvironments,
      extractTwilioServerlessVariable,
      extractTwilioServerlessVariables,
      extractTwilioServerlessDeployment,
    ];
    const texts = ["", "null", "[]", "{", "1", '"x"', '{"functions":5}', '{"variables":{"a":1}}', '{"meta":null,"assets":[[]]}', JSON.stringify({ sid: null })];
    for (const extract of extractors) {
      for (const text of texts) {
        for (const status of [200, 201, 0, 302, 500]) expect(extract({ status, text }).ok).toBe(false);
      }
    }
  });
});

describe("callTwilio with the requests of this entry", () => {
  it("sends a status read through the fetch, and reads the build", async () => {
    const seen: { url: string; method: string }[] = [];
    const fetch: TwilioFetch = async (url, init) => {
      seen.push({ url, method: init.method });
      return { status: 200, text: async () => JSON.stringify(statusBody("completed")), headers: { get: () => null } };
    };
    const build = await callTwilio(fetch, twilioServerlessBuildStatusRequest(CREDENTIALS, SERVICE, BUILD), extractTwilioServerlessBuild, { timeoutMs: 1_000 });
    expect(build).toEqual({ ok: true, sid: BUILD, serviceSid: SERVICE, status: "completed" });
    expect(seen).toEqual([{ url: `${SERVICE_URL}/Builds/${BUILD}/Status`, method: "GET" }]);
  });
});
