/**
 * The host policy (roadmap R38): the classes of addresses, the entries of `allow`, and the check
 * of a URL with its resolved addresses. The tests use a fake resolver, so no DNS runs.
 */

import { describe, expect, it } from "vitest";
import { InvocationError } from "@procedures/client";
import { formatAddress, isPublicAddress, parseAddress, parseRange, rangeHas, specialClass } from "./address.js";
import { checkHost, createHostPolicy, DEFAULT_HOST_POLICY, HOST_NOT_ALLOWED, isHostNotAllowed, systemResolver, type HostPolicyOptions, type ResolvedAddress } from "./policy.js";

const PATH = ["http", "request"];

/** A resolver with fixed answers. */
function resolver(answers: Record<string, string[]>): (name: string) => Promise<ResolvedAddress[]> {
  return async (name) => {
    const found = answers[name];
    if (!found) {
      const error = new Error(`getaddrinfo ENOTFOUND ${name}`) as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      throw error;
    }
    return found.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
}

function policy(options: HostPolicyOptions, answers: Record<string, string[]> = {}) {
  return createHostPolicy({ ...options, resolve: resolver(answers) });
}

async function refusal(promise: Promise<unknown>): Promise<InvocationError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(InvocationError);
  expect(error).toMatchObject({ code: "FORBIDDEN", reason: HOST_NOT_ALLOWED });
  expect(isHostNotAllowed(error)).toBe(true);
  return error as InvocationError;
}

describe("the classes of addresses", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.32.0.1",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "2002:808:808::1",
  ])("%s is public", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "link-local"],
    ["100.64.0.1", "shared (CGNAT)"],
    ["0.0.0.0", "this-network"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "reserved"],
    ["192.0.2.1", "documentation"],
    ["198.18.0.1", "benchmarking"],
    ["::1", "loopback"],
    ["::", "unspecified"],
    ["fe80::1", "link-local"],
    ["fd12:3456::1", "unique local (private)"],
    ["ff02::1", "multicast"],
    ["::ffff:127.0.0.1", "loopback (in IPv6)"],
    ["::ffff:7f00:1", "loopback (in IPv6)"],
    ["64:ff9b::a00:1", "private (in IPv6)"],
    ["2002:7f00:1::", "loopback (in 6to4)"],
    ["2001:db8::1", "documentation"],
    ["2001::1", "IETF protocol assignment"],
    ["100::1", "reserved"],
    ["[::1]", "loopback"],
    ["fe80::1%eth0", "link-local"],
  ])("%s is %s", (address, name) => {
    expect(isPublicAddress(address)).toBe(false);
    expect(specialClass(parseAddress(address)!)).toBe(name);
  });

  it("parses only IP addresses", () => {
    for (const text of ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "01.2.3.4", "example.com", "1::2::3", "12345::1", ":::"]) {
      expect(parseAddress(text), text).toBeUndefined();
      expect(isPublicAddress(text), text).toBe(false);
    }
    expect([...parseAddress("1.2.3.4")!]).toEqual([1, 2, 3, 4]);
    expect(parseAddress("::ffff:1.2.3.4")!.length).toBe(16);
  });

  it("formats addresses in the compressed form", () => {
    expect(formatAddress(parseAddress("0:0:0:0:0:0:0:1")!)).toBe("::1");
    expect(formatAddress(parseAddress("2001:db8:0:0:1:0:0:1")!)).toBe("2001:db8::1:0:0:1");
    expect(formatAddress(parseAddress("1:2:3:4:5:6:7:8")!)).toBe("1:2:3:4:5:6:7:8");
    expect(formatAddress(parseAddress("::")!)).toBe("::");
    expect(formatAddress(parseAddress("10.0.0.1")!)).toBe("10.0.0.1");
  });

  it("matches CIDR ranges", () => {
    const range = parseRange("10.0.0.0/8")!;
    expect(rangeHas(range, parseAddress("10.255.0.1")!)).toBe(true);
    expect(rangeHas(range, parseAddress("11.0.0.1")!)).toBe(false);
    expect(rangeHas(parseRange("172.16.0.0/12")!, parseAddress("172.31.0.1")!)).toBe(true);
    expect(rangeHas(parseRange("172.16.0.0/12")!, parseAddress("172.32.0.1")!)).toBe(false);
    expect(rangeHas(parseRange("fd00::/8")!, parseAddress("fd12::1")!)).toBe(true);
    expect(rangeHas(parseRange("0.0.0.0/0")!, parseAddress("8.8.8.8")!)).toBe(true);
    // An IPv4 range does not have an IPv6 address
    expect(rangeHas(range, parseAddress("::ffff:10.0.0.1")!)).toBe(false);
    expect(parseRange("10.0.0.0/33")).toBeUndefined();
    expect(parseRange("10.0.0.0/x")).toBeUndefined();
  });
});

describe("the entries of allow", () => {
  it("accepts names, wildcards, addresses, ranges and ports", () => {
    expect(() =>
      createHostPolicy({ allow: ["localhost", "api.example.com", "*.example.com", "127.0.0.1", "::1", "[::1]:8080", "10.0.0.0/8", "fd00::/8", "localhost:11434", "10.0.0.0/8:443", "Example.COM."] }),
    ).not.toThrow();
  });

  it.each(["http://example.com", "a b", "1.2.3.4/33", "host:99999", "host:0", "*.", "-bad-.com", ""])("refuses %j at the start", (entry) => {
    expect(() => createHostPolicy({ allow: [entry] })).toThrow(/allow entry/);
  });
});

describe("checkHost", () => {
  it("allows a public address and refuses loopback, private and link-local addresses by default", async () => {
    await expect(checkHost(DEFAULT_HOST_POLICY, new URL("http://8.8.8.8/"), PATH)).resolves.toMatchObject({ hostname: "8.8.8.8", port: 80 });
    for (const url of ["http://127.0.0.1/", "http://10.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]:8080/", "http://[::ffff:127.0.0.1]/", "http://0.0.0.0/"]) {
      const error = await refusal(checkHost(DEFAULT_HOST_POLICY, new URL(url), PATH));
      expect(error.message).toMatch(/^http\.request: the host of the URL is not allowed/);
    }
  });

  it("reads the other forms of an IPv4 address as the URL parser does", async () => {
    for (const url of ["http://2130706433/", "http://0x7f.1/", "http://127.1/", "http://0177.0.0.1/"]) {
      expect(new URL(url).hostname).toBe("127.0.0.1");
      await refusal(checkHost(DEFAULT_HOST_POLICY, new URL(url), PATH));
    }
  });

  it("examines the resolved addresses of a name", async () => {
    const answers = { "public.test": ["93.184.216.34"], "private.test": ["10.0.0.5"], "loop.test": ["127.0.0.1", "::1"] };
    const p = policy({}, answers);
    await expect(checkHost(p, new URL("https://public.test/"), PATH)).resolves.toEqual({
      hostname: "public.test",
      port: 443,
      addresses: [{ address: "93.184.216.34", family: 4 }],
    });
    const error = await refusal(checkHost(p, new URL("http://private.test/"), PATH));
    expect(error.message).toContain("10.0.0.5 is a private address");
    expect((await refusal(checkHost(p, new URL("http://loop.test/"), PATH))).message).toContain("127.0.0.1 is a loopback address, ::1 is a loopback address");
  });

  it("keeps only the allowed addresses of a name that has public and private addresses (DNS rebinding)", async () => {
    const p = policy({}, { "mixed.test": ["127.0.0.1", "93.184.216.34", "fd00::1"] });
    const target = await checkHost(p, new URL("http://mixed.test/"), PATH);
    expect(target.addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("allows a name of allow with each of its addresses", async () => {
    const p = policy({ allow: ["localhost"] }, { localhost: ["::1", "127.0.0.1"], "localhost.": ["::1", "127.0.0.1"] });
    expect((await checkHost(p, new URL("http://localhost:3000/"), PATH)).addresses).toHaveLength(2);
    expect((await checkHost(p, new URL("http://LOCALHOST./"), PATH)).addresses).toHaveLength(2);
  });

  it("allows the addresses of a range of allow, also behind a name", async () => {
    const p = policy({ allow: ["127.0.0.1", "10.0.0.0/8"] }, { "internal.test": ["10.1.2.3"], "other.test": ["192.168.0.1"] });
    await expect(checkHost(p, new URL("http://127.0.0.1:9000/"), PATH)).resolves.toMatchObject({ port: 9000 });
    await expect(checkHost(p, new URL("http://internal.test/"), PATH)).resolves.toMatchObject({ addresses: [{ address: "10.1.2.3" }] });
    await refusal(checkHost(p, new URL("http://other.test/"), PATH));
    await refusal(checkHost(p, new URL("http://127.0.0.2/"), PATH));
  });

  it("obeys the port of an entry", async () => {
    const p = policy({ allow: ["127.0.0.1:8080", "localhost:11434", "[::1]:9000"] }, { localhost: ["127.0.0.2"] });
    await expect(checkHost(p, new URL("http://127.0.0.1:8080/"), PATH)).resolves.toBeDefined();
    await refusal(checkHost(p, new URL("http://127.0.0.1:6379/"), PATH));
    await expect(checkHost(p, new URL("http://localhost:11434/"), PATH)).resolves.toBeDefined();
    await refusal(checkHost(p, new URL("http://localhost:6379/"), PATH));
    await expect(checkHost(p, new URL("http://[::1]:9000/"), PATH)).resolves.toBeDefined();
    await refusal(checkHost(p, new URL("http://[::1]:9001/"), PATH));
  });

  it("allows the names under a wildcard, not the name itself", async () => {
    const p = policy({ allow: ["*.corp.test"], publicHosts: false }, { "a.corp.test": ["10.0.0.1"], "b.a.corp.test": ["10.0.0.2"], "corp.test": ["10.0.0.3"] });
    await expect(checkHost(p, new URL("http://a.corp.test/"), PATH)).resolves.toBeDefined();
    await expect(checkHost(p, new URL("http://b.a.corp.test/"), PATH)).resolves.toBeDefined();
    await refusal(checkHost(p, new URL("http://corp.test/"), PATH));
  });

  it("refuses the public hosts with publicHosts: false", async () => {
    const p = policy({ allow: ["api.example.test"], publicHosts: false }, { "api.example.test": ["93.184.216.34"], "other.test": ["93.184.216.35"] });
    await expect(checkHost(p, new URL("https://api.example.test/"), PATH)).resolves.toBeDefined();
    const error = await refusal(checkHost(p, new URL("https://other.test/"), PATH));
    expect(error.message).toContain("is not in the allowed hosts");
    await refusal(checkHost(p, new URL("https://8.8.8.8/"), PATH));
    await refusal(checkHost(createHostPolicy({ publicHosts: false }), new URL("https://8.8.8.8/"), PATH));
  });

  it("names a redirect in the message", async () => {
    const error = await refusal(checkHost(DEFAULT_HOST_POLICY, new URL("http://10.0.0.1/"), PATH, "the redirect to http://10.0.0.1/"));
    expect(error.message).toContain("the redirect to http://10.0.0.1/");
  });

  it("fails without FORBIDDEN for a name without an address", async () => {
    const p = policy({}, { "empty.test": [] });
    await expect(checkHost(p, new URL("http://missing.test/"), PATH)).rejects.toThrow("the host missing.test of the URL has no address (ENOTFOUND)");
    await expect(checkHost(p, new URL("http://empty.test/"), PATH)).rejects.toThrow("has no address");
  });
});

describe("systemResolver", () => {
  it("gives each address of a name from the system, with its family", async () => {
    // localhost comes from the hosts file of the system, so the test needs no network
    const found = await systemResolver("localhost");
    expect(found.length).toBeGreaterThan(0);
    for (const entry of found) expect([4, 6]).toContain(entry.family);
    expect(found.some((entry) => entry.address === "127.0.0.1" || entry.address === "::1")).toBe(true);
  });
});
