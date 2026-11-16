import { describe, expect, it } from "vitest";
import type { TwilioCredentials, TwilioFetch } from "./twilio.js";
import {
  TWILIO_SERVERLESS_API,
  TWILIO_SERVERLESS_UPLOAD_API,
  TWILIO_SERVERLESS_VERSION_KEY,
  twilioServerlessDeploy,
  type TwilioServerlessDeployPlan,
  type TwilioServerlessDeployPorts,
} from "./twilio-serverless.js";

// The keys, the SIDs and the domain names are made up. The fake answers in the shapes of the Twilio docs
// that `twilio-serverless.test.ts` records, with only the keys that the extractors read.
const CREDENTIALS: TwilioCredentials = { accountSid: `AC${"0".repeat(32)}`, secret: "madeupsecret00000000000000000000" };
const SECRET_VALUE = "made-up-token-0000";

interface Row {
  readonly sid: string;
  [key: string]: unknown;
}

interface FakeOptions {
  /** The count of status reads of a build that give `building` before its end. */
  readonly building?: number;
  /** The end status of each build. */
  readonly end?: "completed" | "failed";
  /** The count of items in one page of each list. */
  readonly pageSize?: number;
  /** The HTTP status of each read of a service, in place of the read. */
  readonly serviceStatus?: number;
}

/** A fake of the Twilio Serverless API in memory. It keeps each request as its method and path. */
class FakeServerless {
  readonly requests: string[] = [];
  readonly services: Row[] = [];
  readonly functions: Row[] = [];
  readonly assets: Row[] = [];
  readonly versions: Row[] = [];
  readonly builds: Row[] = [];
  readonly environments: Row[] = [];
  readonly variables: Row[] = [];
  readonly deployments: Row[] = [];
  readonly options: FakeOptions;
  private count = 0;

  constructor(options: FakeOptions = {}) {
    this.options = options;
  }

  readonly fetch: TwilioFetch = async (url, init) => {
    const reply = this.answer(new URL(url), init.method, init.body ?? "", init.headers["content-type"] ?? "");
    return { status: reply.status, text: async () => JSON.stringify(reply.body), headers: { get: () => null } };
  };

  private sid(prefix: string): string {
    this.count += 1;
    return `${prefix}${this.count.toString(16).padStart(32, "0")}`;
  }

  private page(url: URL, key: string, rows: readonly Row[]): { status: number; body: unknown } {
    const size = this.options.pageSize ?? 50;
    const index = Number(url.searchParams.get("Page") ?? "0");
    const items = rows.slice(index * size, (index + 1) * size);
    const more = (index + 1) * size < rows.length;
    const next = more ? `${url.origin}${url.pathname}?PageSize=${size}&Page=${index + 1}&PageToken=PT${index + 1}` : null;
    return { status: 200, body: { [key]: items, meta: { key, page: index, page_size: size, next_page_url: next } } };
  }

  private answer(url: URL, method: string, body: string, type: string): { status: number; body: unknown } {
    this.requests.push(`${method} ${url.host === new URL(TWILIO_SERVERLESS_UPLOAD_API).host ? "upload:" : ""}${url.pathname}`);
    const form = new URLSearchParams(type.startsWith("application/x-www-form-urlencoded") ? body : "");
    const parts = url.pathname.split("/").slice(2);
    const missing = { status: 404, body: { code: 20404, message: "The requested resource was not found", status: 404 } };
    if (parts[0] !== "Services") return missing;
    if (parts.length === 1 && method === "POST") {
      const row = { sid: this.sid("ZS"), unique_name: form.get("UniqueName"), friendly_name: form.get("FriendlyName"), include_credentials: form.get("IncludeCredentials") !== "false" };
      this.services.push(row);
      return { status: 201, body: row };
    }
    const service = this.services.find((row) => row.sid === parts[1] || row["unique_name"] === parts[1]);
    if (parts.length === 2 && method === "GET" && this.options.serviceStatus !== undefined) return { status: this.options.serviceStatus, body: { code: 20003, message: "Authenticate" } };
    if (service === undefined) return missing;
    const serviceSid = service.sid;
    if (parts.length === 2) return { status: 200, body: service };
    const collection = parts[2];
    if (collection === "Functions" || collection === "Assets") {
      const rows = collection === "Functions" ? this.functions : this.assets;
      if (parts.length === 3 && method === "GET") return this.page(url, collection.toLowerCase(), rows);
      if (parts.length === 3 && method === "POST") {
        const row = { sid: this.sid("ZH"), service_sid: serviceSid, friendly_name: form.get("FriendlyName") };
        rows.push(row);
        return { status: 201, body: row };
      }
      if (parts.length === 5 && parts[4] === "Versions" && method === "POST") {
        const field = (name: string): string | undefined => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)\\r\\n`, "u").exec(body)?.[1];
        const content = /filename="[^"]*"\r\nContent-Type: [^\r]*\r\n\r\n([\s\S]*?)\r\n--/u.exec(body)?.[1];
        const resource = collection === "Functions" ? "function_sid" : "asset_sid";
        const row = { sid: this.sid("ZN"), service_sid: serviceSid, [resource]: parts[3], path: field("Path"), visibility: field("Visibility"), content };
        this.versions.push(row);
        return { status: 201, body: row };
      }
    }
    if (collection === "Builds") {
      if (parts.length === 3 && method === "POST") {
        const row = { sid: this.sid("ZB"), service_sid: serviceSid, status: "building", runtime: form.get("Runtime"), versions: [...form.getAll("FunctionVersions"), ...form.getAll("AssetVersions")], dependencies: form.get("Dependencies"), reads: 0 };
        this.builds.push(row);
        return { status: 201, body: row };
      }
      const build = this.builds.find((row) => row.sid === parts[3]);
      if (build !== undefined && parts[4] === "Status" && method === "GET") {
        const reads = Number(build["reads"]) + 1;
        build["reads"] = reads;
        if (reads > (this.options.building ?? 1)) build["status"] = this.options.end ?? "completed";
        return { status: 200, body: { sid: build.sid, service_sid: serviceSid, status: build["status"] } };
      }
    }
    if (collection === "Environments") {
      if (parts.length === 3 && method === "GET") return this.page(url, "environments", this.environments);
      if (parts.length === 3 && method === "POST") {
        const suffix = form.get("DomainSuffix");
        const row = { sid: this.sid("ZE"), service_sid: serviceSid, unique_name: form.get("UniqueName"), domain_suffix: suffix, domain_name: `${String(service["unique_name"])}-0000${suffix === null ? "" : `-${suffix}`}.twil.io`, build_sid: null };
        this.environments.push(row);
        return { status: 201, body: row };
      }
      const environment = this.environments.find((row) => row.sid === parts[3]);
      if (environment === undefined) return missing;
      if (parts[4] === "Variables") {
        if (parts.length === 5 && method === "GET") return this.page(url, "variables", this.variables.filter((row) => row["environment_sid"] === environment.sid));
        if (parts.length === 5 && method === "POST") {
          const row = { sid: this.sid("ZV"), service_sid: serviceSid, environment_sid: environment.sid, key: form.get("Key"), value: form.get("Value") };
          this.variables.push(row);
          return { status: 201, body: row };
        }
        const variable = this.variables.find((row) => row.sid === parts[5]);
        if (variable !== undefined && method === "POST") {
          variable["value"] = form.get("Value");
          return { status: 200, body: variable };
        }
      }
      if (parts[4] === "Deployments" && method === "POST") {
        const build = this.builds.find((row) => row.sid === form.get("BuildSid"));
        if (build === undefined || build["status"] !== "completed") return { status: 400, body: { code: 20001, message: "The build is not complete", status: 400 } };
        environment["build_sid"] = build.sid;
        const row = { sid: this.sid("ZD"), service_sid: serviceSid, environment_sid: environment.sid, build_sid: build.sid };
        this.deployments.push(row);
        return { status: 201, body: row };
      }
    }
    return missing;
  }

  variable(key: string): unknown {
    return this.variables.find((row) => row["key"] === key)?.["value"];
  }
}

const PLAN: TwilioServerlessDeployPlan = {
  service: { uniqueName: "test-app", friendlyName: "A test app", includeCredentials: true },
  environment: { uniqueName: "production", domainSuffix: "prod" },
  functions: [
    { path: "/start", visibility: "public", content: "exports.handler = (context, event, callback) => callback(null, 'start');" },
    { path: "/press", visibility: "protected", content: "exports.handler = (context, event, callback) => callback(null, 'press');" },
  ],
  assets: [{ path: "/list.json", visibility: "private", content: '{"people":[]}' }],
  build: { runtime: "node22", dependencies: { twilio: "5.0.0" } },
  variables: { TOKEN: SECRET_VALUE, FROM: "made-up-from-0000" },
  version: "v1",
};

function ports(fake: FakeServerless): TwilioServerlessDeployPorts & { readonly sleeps: number[]; readonly lines: string[] } {
  let at = 1_000_000;
  const sleeps: number[] = [];
  const lines: string[] = [];
  return {
    fetch: fake.fetch,
    now: () => at,
    sleep: async (ms) => {
      sleeps.push(ms);
      at += ms;
    },
    log: (line) => lines.push(line),
    sleeps,
    lines,
  };
}

describe("twilioServerlessDeploy", () => {
  it("makes the service, the environment, the variables and the files, then builds, deploys and writes the version", async () => {
    const fake = new FakeServerless({ building: 2 });
    const effects = ports(fake);
    const result = await twilioServerlessDeploy(effects, CREDENTIALS, PLAN);
    expect(result).toEqual({
      ok: true,
      changed: true,
      serviceSid: fake.services[0]!.sid,
      environmentSid: fake.environments[0]!.sid,
      domainName: "test-app-0000-prod.twil.io",
      buildSid: fake.builds[0]!.sid,
    });
    expect(fake.functions.map((row) => row["friendly_name"])).toEqual(["/start", "/press"]);
    expect(fake.assets.map((row) => row["friendly_name"])).toEqual(["/list.json"]);
    expect(fake.versions.map((row) => [row["path"], row["visibility"], row["content"]])).toEqual([
      ["/start", "public", PLAN.functions[0]!.content],
      ["/press", "protected", PLAN.functions[1]!.content],
      ["/list.json", "private", PLAN.assets![0]!.content],
    ]);
    expect(fake.builds[0]!["versions"]).toEqual(fake.versions.map((row) => row.sid));
    expect(fake.builds[0]!["runtime"]).toBe("node22");
    expect(JSON.parse(String(fake.builds[0]!["dependencies"]))).toEqual([{ name: "twilio", version: "5.0.0" }]);
    expect(fake.environments[0]!["build_sid"]).toBe(fake.builds[0]!.sid);
    expect([fake.variable("TOKEN"), fake.variable("FROM"), fake.variable(TWILIO_SERVERLESS_VERSION_KEY)]).toEqual([SECRET_VALUE, "made-up-from-0000", "v1"]);
    // The build starts as building, so the poll waits the interval before each read of the status.
    expect(effects.sleeps).toEqual([2_000, 2_000, 2_000]);
  });

  it("writes the variables before the deployment, and the version after it", async () => {
    const fake = new FakeServerless();
    await twilioServerlessDeploy(ports(fake), CREDENTIALS, PLAN);
    const order = fake.requests.filter((line) => /Variables|Deployments/u.test(line)).map((line) => line.replace(/Z[A-Z][0-9a-f]{32}/gu, "*"));
    expect(order).toEqual([
      "GET /v1/Services/*/Environments/*/Variables",
      "POST /v1/Services/*/Environments/*/Variables",
      "POST /v1/Services/*/Environments/*/Variables",
      "POST /v1/Services/*/Environments/*/Deployments",
      "POST /v1/Services/*/Environments/*/Variables",
    ]);
  });

  it("changes nothing on a second deploy of the same plan, after three reads", async () => {
    const fake = new FakeServerless();
    const first = await twilioServerlessDeploy(ports(fake), CREDENTIALS, PLAN);
    const before = fake.requests.length;
    const second = await twilioServerlessDeploy(ports(fake), CREDENTIALS, PLAN);
    expect(second).toEqual({ ...first, changed: false });
    expect(fake.requests.slice(before).map((line) => line.split(" ")[0])).toEqual(["GET", "GET", "GET"]);
    expect(fake.builds).toHaveLength(1);
    expect(fake.deployments).toHaveLength(1);
  });

  it("deploys the build of the environment again when only a variable changes", async () => {
    const fake = new FakeServerless();
    const first = await twilioServerlessDeploy(ports(fake), CREDENTIALS, PLAN);
    const result = await twilioServerlessDeploy(ports(fake), CREDENTIALS, { ...PLAN, variables: { ...PLAN.variables, TOKEN: "made-up-token-0001" } });
    expect(result).toEqual({ ...first, changed: true });
    expect(fake.versions).toHaveLength(3);
    expect(fake.builds).toHaveLength(1);
    expect(fake.deployments.map((row) => row["build_sid"])).toEqual([first.ok ? first.buildSid : "", first.ok ? first.buildSid : ""]);
    expect(fake.variable("TOKEN")).toBe("made-up-token-0001");
    expect(fake.variables.filter((row) => row["key"] === "TOKEN")).toHaveLength(1);
  });

  it("uploads new versions of the same functions for a new version of the plan", async () => {
    const fake = new FakeServerless();
    await twilioServerlessDeploy(ports(fake), CREDENTIALS, PLAN);
    const changed = { ...PLAN, functions: [PLAN.functions[0]!, { ...PLAN.functions[1]!, content: "exports.handler = () => undefined;" }], version: "v2" };
    const result = await twilioServerlessDeploy(ports(fake), CREDENTIALS, changed);
    expect(result).toMatchObject({ ok: true, changed: true, buildSid: fake.builds[1]!.sid });
    expect(fake.functions).toHaveLength(2);
    expect(fake.assets).toHaveLength(1);
    expect(fake.versions).toHaveLength(6);
    expect(fake.environments[0]!["build_sid"]).toBe(fake.builds[1]!.sid);
    expect(fake.variable(TWILIO_SERVERLESS_VERSION_KEY)).toBe("v2");
    expect(fake.variables.filter((row) => row["key"] === TWILIO_SERVERLESS_VERSION_KEY)).toHaveLength(1);
  });

  it("reads each page of a list", async () => {
    const fake = new FakeServerless({ pageSize: 1 });
    await twilioServerlessDeploy(ports(fake), CREDENTIALS, PLAN);
    const second = await twilioServerlessDeploy(ports(fake), CREDENTIALS, PLAN);
    expect(second).toMatchObject({ ok: true, changed: false });
    expect(fake.variables).toHaveLength(3);
    expect(fake.functions).toHaveLength(2);
  });

  it("stops at a failed build, deploys nothing and writes no version", async () => {
    const fake = new FakeServerless({ end: "failed" });
    const result = await twilioServerlessDeploy(ports(fake), CREDENTIALS, PLAN);
    expect(result).toEqual({ ok: false, stage: "build", errors: [`The build ${fake.builds[0]!.sid} failed.`] });
    expect(fake.deployments).toHaveLength(0);
    expect(fake.variable(TWILIO_SERVERLESS_VERSION_KEY)).toBeUndefined();
  });

  it("stops at a build that does not end in the time limit of the poll", async () => {
    const fake = new FakeServerless({ building: 1_000 });
    const effects = ports(fake);
    const result = await twilioServerlessDeploy(effects, CREDENTIALS, PLAN);
    expect(result).toMatchObject({ ok: false, stage: "build" });
    expect(effects.sleeps.reduce((sum, ms) => sum + ms, 0)).toBe(300_000);
    expect(fake.deployments).toHaveLength(0);
  });

  it("gives the failure of a refused read of the service, and makes no service", async () => {
    const fake = new FakeServerless({ serviceStatus: 401 });
    const result = await twilioServerlessDeploy(ports(fake), CREDENTIALS, PLAN);
    expect(result).toMatchObject({ ok: false, stage: "service", failure: { ok: false, kind: "auth", status: 401 } });
    expect(fake.services).toHaveLength(0);
  });

  it("writes no value of a variable to the log", async () => {
    const effects = ports(new FakeServerless());
    await twilioServerlessDeploy(effects, CREDENTIALS, PLAN);
    expect(effects.lines.length).toBeGreaterThan(0);
    expect(effects.lines.join("\n")).not.toContain(SECRET_VALUE);
    expect(effects.lines.join("\n")).not.toContain("made-up-from-0000");
  });

  it("throws for a plan that breaks a rule", async () => {
    const fake = new FakeServerless();
    await expect(twilioServerlessDeploy(ports(fake), CREDENTIALS, { ...PLAN, functions: [] })).rejects.toThrow("no function");
    await expect(twilioServerlessDeploy(ports(fake), CREDENTIALS, { ...PLAN, assets: [{ ...PLAN.assets![0]!, path: "/start" }] })).rejects.toThrow("same path");
    await expect(twilioServerlessDeploy(ports(fake), CREDENTIALS, { ...PLAN, variables: { [TWILIO_SERVERLESS_VERSION_KEY]: "x" } })).rejects.toThrow("key of the version");
    await expect(twilioServerlessDeploy(ports(fake), CREDENTIALS, { ...PLAN, version: "" })).rejects.toThrow("version of the plan");
    expect(fake.requests).toEqual([]);
  });

  it("sends each request to a host of the Twilio Serverless API", async () => {
    const hosts = new Set<string>();
    const fake = new FakeServerless();
    const fetch: TwilioFetch = async (url, init) => {
      hosts.add(new URL(url).host);
      return fake.fetch(url, init);
    };
    await twilioServerlessDeploy({ ...ports(fake), fetch }, CREDENTIALS, PLAN);
    expect([...hosts].sort()).toEqual([new URL(TWILIO_SERVERLESS_API).host, new URL(TWILIO_SERVERLESS_UPLOAD_API).host].sort());
  });
});
