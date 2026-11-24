/**
 * These tests examine the billing reads with a fake REST client. They cover the requests, the extractors, the sums
 * of each product and the permissions of each endpoint.
 */

import { describe, expect, it } from "vitest";
import {
  BILLING_PERMISSIONS,
  billingUsageRequest,
  extractBillingUsage,
  extractOrganizationBudgets,
  netAmountByProduct,
  organizationBudgetsRequest,
  readBillingUsage,
  readOrganizationBudgets,
  usageAmounts,
  usageAmountsBy,
  usageDay,
  type BillingEndpoint,
  type BillingUsageItem,
} from "./billing.js";
import type { RestAnswer, RestClient, RestRequest } from "./rest.js";

const signal = new AbortController().signal;
const answer = (status: number, body: unknown): RestAnswer => ({ status, body, cached: false });

function fake(answers: RestAnswer[]): { client: RestClient; requests: RestRequest[] } {
  const requests: RestRequest[] = [];
  const client: RestClient = {
    request: async (request) => {
      requests.push(request);
      return answers.shift() ?? answer(500, null);
    },
    state: () => {
      throw new Error("The tests do not read the state.");
    },
  };
  return { client, requests };
}

const item = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({
  date: "2026-11-02T00:00:00Z",
  product: "Actions",
  sku: "actions_linux",
  quantity: 120,
  unitType: "Minutes",
  pricePerUnit: 0.008,
  grossAmount: 0.96,
  discountAmount: 0.5,
  netAmount: 0.46,
  ...fields,
});

const budget = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "b1",
  budget_type: "ProductPricing",
  budget_scope: "organization",
  budget_entity_name: "lab",
  budget_product_sku: "actions",
  budget_amount: 0,
  prevent_further_usage: true,
  ...fields,
});

const budgets = (list: unknown[], fields: Record<string, unknown> = {}): RestAnswer => answer(200, { budgets: list, has_next_page: false, total_count: list.length, ...fields });

describe("billingUsageRequest", () => {
  it("gives the path of a user and of an organization, with the period as the query", () => {
    expect(billingUsageRequest({ kind: "user", login: "octo" }, { year: 2026, month: 11 })).toEqual({
      method: "GET",
      path: "/users/octo/settings/billing/usage",
      query: { year: "2026", month: "11" },
    });
    expect(billingUsageRequest({ kind: "organization", login: "lab-2" }, { year: 2026, month: 2, day: 9 })).toEqual({
      method: "GET",
      path: "/organizations/lab-2/settings/billing/usage",
      query: { year: "2026", month: "2", day: "9" },
    });
    expect(billingUsageRequest({ kind: "user", login: "octo" }, { year: 2026 }).query).toEqual({ year: "2026" });
  });

  it("refuses a login that GitHub does not allow", () => {
    for (const login of ["", "-octo", "octo-", "oc--to", "octo/../admin", "a".repeat(40), "octo?x=1"]) {
      expect(() => billingUsageRequest({ kind: "user", login }, { year: 2026 })).toThrow(RangeError);
    }
    expect(() => billingUsageRequest({ kind: "user", login: "a".repeat(39) }, { year: 2026 })).not.toThrow();
  });

  it("refuses a period that is not valid", () => {
    const account = { kind: "user", login: "octo" } as const;
    for (const period of [{ year: 26 }, { year: 2026.5 }, { year: 2026, month: 0 }, { year: 2026, month: 13 }, { year: 2026, month: 1, day: 32 }, { year: 2026, day: 3 }]) {
      expect(() => billingUsageRequest(account, period)).toThrow(RangeError);
    }
  });
});

describe("extractBillingUsage", () => {
  it("reads each item, and a null field is absent", () => {
    const items = extractBillingUsage(answer(200, { usageItems: [item(), item({ product: "Copilot", sku: null, date: undefined, quantity: null, grossAmount: undefined, discountAmount: undefined, netAmount: 0 })] }));
    expect(items).toEqual([
      { product: "Actions", sku: "actions_linux", date: "2026-11-02T00:00:00Z", quantity: 120, grossAmount: 0.96, discountAmount: 0.5, netAmount: 0.46 },
      { product: "Copilot", sku: undefined, date: undefined, quantity: undefined, grossAmount: undefined, discountAmount: undefined, netAmount: 0 },
    ]);
    expect(extractBillingUsage(answer(200, { usageItems: [] }))).toEqual([]);
  });

  it("reads the repository and the organization of an item, and an empty name is absent", () => {
    const items = extractBillingUsage(answer(200, { usageItems: [item({ repositoryName: "lab/site", organizationName: "lab" }), item({ repositoryName: "", organizationName: null })] }));
    expect(items?.[0]).toMatchObject({ repository: "lab/site", organization: "lab" });
    expect(items?.[1]).not.toHaveProperty("repository");
    expect(items?.[1]).not.toHaveProperty("organization");
  });

  it("gives undefined for an answer that it cannot read", () => {
    const cases: RestAnswer[] = [
      answer(404, { usageItems: [item()] }),
      answer(200, null),
      answer(200, []),
      answer(200, { items: [item()] }),
      answer(200, { usageItems: [item(), "x"] }),
      answer(200, { usageItems: [item({ product: "" })] }),
      answer(200, { usageItems: [item({ product: 7 })] }),
      answer(200, { usageItems: [item({ netAmount: "0.46" })] }),
      answer(200, { usageItems: [item({ netAmount: Number.NaN })] }),
      answer(200, { usageItems: [item({ netAmount: undefined })] }),
      answer(200, { usageItems: [item({ sku: 5 })] }),
      answer(200, { usageItems: [item({ repositoryName: 5 })] }),
      answer(200, { usageItems: [item({ organizationName: ["lab"] })] }),
      answer(200, { usageItems: [item({ quantity: "120" })] }),
      answer(200, { usageItems: [item({ grossAmount: Number.POSITIVE_INFINITY })] }),
    ];
    for (const one of cases) expect(extractBillingUsage(one)).toBeUndefined();
  });
});

describe("netAmountByProduct", () => {
  it("adds the net amounts of each product, with the name in lower case", () => {
    const sums = netAmountByProduct([
      { product: "Actions", sku: "a", date: undefined, quantity: undefined, grossAmount: undefined, discountAmount: undefined, netAmount: 0.25 },
      { product: "actions", sku: "b", date: undefined, quantity: undefined, grossAmount: undefined, discountAmount: undefined, netAmount: 0.5 },
      { product: "Packages", sku: "c", date: undefined, quantity: undefined, grossAmount: undefined, discountAmount: undefined, netAmount: 0 },
    ]);
    expect([...sums]).toEqual([
      ["actions", 0.75],
      ["packages", 0],
    ]);
  });
});

const use = (fields: Partial<BillingUsageItem> = {}): BillingUsageItem => ({
  product: "Actions",
  sku: "actions_linux",
  date: "2026-11-02T00:00:00Z",
  quantity: 100,
  grossAmount: 0.75,
  discountAmount: 0.25,
  netAmount: 0.5,
  ...fields,
});

describe("usageAmounts", () => {
  it("adds the costs before the discounts, the discounts and the costs after them", () => {
    expect(usageAmounts([use(), use({ grossAmount: 0.5, discountAmount: 0.5, netAmount: 0 }), use({ grossAmount: 2, discountAmount: 0, netAmount: 2 })])).toEqual({ items: 3, gross: 3.25, discount: 0.75, net: 2.5 });
    expect(usageAmounts([])).toEqual({ items: 0, gross: 0, discount: 0, net: 0 });
  });

  it("gives no sum of a part of the items: one item with no such amount makes the sum undefined", () => {
    expect(usageAmounts([use(), use({ grossAmount: undefined })])).toEqual({ items: 2, gross: undefined, discount: 0.5, net: 1 });
    expect(usageAmounts([use({ discountAmount: undefined }), use()])).toEqual({ items: 2, gross: 1.5, discount: undefined, net: 1 });
  });
});

describe("usageAmountsBy", () => {
  const items = [
    use({ repository: "lab/site", date: "2026-11-02T00:00:00Z" }),
    use({ repository: "lab/tools", date: "2026-11-02T00:00:00Z", grossAmount: 2, discountAmount: 0, netAmount: 2 }),
    use({ repository: "lab/site", date: "2026-11-03T00:00:00Z", grossAmount: 0.25, discountAmount: 0.25, netAmount: 0 }),
    use({ product: "Copilot", sku: "copilot_seat", grossAmount: 4, discountAmount: 0, netAmount: 4 }),
  ];

  it("gives the sums of each repository, in the order of its first item, and leaves out an item with no key", () => {
    expect([...usageAmountsBy(items, (one) => one.repository)]).toEqual([
      ["lab/site", { items: 2, gross: 1, discount: 0.5, net: 0.5 }],
      ["lab/tools", { items: 1, gross: 2, discount: 0, net: 2 }],
    ]);
  });

  it("takes each key: the day, the product, or the repository and the day together", () => {
    expect([...usageAmountsBy(items, usageDay).keys()]).toEqual(["2026-11-02", "2026-11-03"]);
    expect(usageAmountsBy(items, usageDay).get("2026-11-02")).toEqual({ items: 3, gross: 6.75, discount: 0.25, net: 6.5 });
    expect([...usageAmountsBy(items, (one) => one.product.toLowerCase()).keys()]).toEqual(["actions", "copilot"]);
    const each = usageAmountsBy(items, (one) => (one.repository === undefined ? undefined : `${one.repository} ${String(usageDay(one))}`));
    expect([...each.keys()]).toEqual(["lab/site 2026-11-02", "lab/tools 2026-11-02", "lab/site 2026-11-03"]);
  });

  it("keeps each item in one group: the sums of the groups are the sums of all items", () => {
    const groups = [...usageAmountsBy(items, (one) => one.sku).values()];
    const all = usageAmounts(items);
    expect(groups.reduce((sum, group) => sum + group.items, 0)).toBe(all.items);
    expect(groups.reduce((sum, group) => sum + group.net, 0)).toBeCloseTo(all.net, 12);
    expect(groups.reduce((sum, group) => sum + (group.gross ?? Number.NaN), 0)).toBeCloseTo(all.gross ?? Number.NaN, 12);
  });
});

describe("usageDay", () => {
  it("gives the day of a date, and undefined for no date or a different form", () => {
    expect(usageDay({ date: "2026-11-02T00:00:00Z" })).toBe("2026-11-02");
    expect(usageDay({ date: "2026-11-02" })).toBe("2026-11-02");
    expect(usageDay({ date: undefined })).toBeUndefined();
    expect(usageDay({ date: "11/02/2026" })).toBeUndefined();
  });
});

describe("readBillingUsage", () => {
  it("sends the request of the period and reads the answer", async () => {
    const { client, requests } = fake([answer(200, { usageItems: [item()] })]);
    const items = await readBillingUsage(client, { kind: "organization", login: "lab" }, { year: 2026, month: 11 }, signal);
    expect(requests).toEqual([{ method: "GET", path: "/organizations/lab/settings/billing/usage", query: { year: "2026", month: "11" } }]);
    expect(items?.map((one) => one.netAmount)).toEqual([0.46]);
  });

  it("gives undefined for a refusal", async () => {
    const { client } = fake([answer(403, { message: "Resource not accessible by personal access token" })]);
    expect(await readBillingUsage(client, { kind: "user", login: "octo" }, { year: 2026 }, signal)).toBeUndefined();
  });
});

describe("the budgets of an organization", () => {
  it("gives the request of the budgets", () => {
    expect(organizationBudgetsRequest("lab")).toEqual({ method: "GET", path: "/organizations/lab/settings/billing/budgets" });
    expect(() => organizationBudgetsRequest("lab/../x")).toThrow(RangeError);
  });

  it("reads each budget", () => {
    expect(extractOrganizationBudgets(budgets([budget(), budget({ budget_scope: "repository", budget_entity_name: "lab/site", budget_amount: 5, prevent_further_usage: false })]))).toEqual([
      { scope: "organization", entity: "lab", product: "actions", amount: 0, stops: true },
      { scope: "repository", entity: "lab/site", product: "actions", amount: 5, stops: false },
    ]);
    expect(extractOrganizationBudgets(budgets([]))).toEqual([]);
  });

  it("gives undefined for an answer that it cannot read", () => {
    const cases: RestAnswer[] = [
      answer(404, { budgets: [], has_next_page: false, total_count: 0 }),
      budgets([budget()], { has_next_page: true }),
      budgets([budget()], { has_next_page: undefined }),
      budgets([budget()], { total_count: 2 }),
      budgets([budget({ budget_product_sku: "" })]),
      budgets([budget({ budget_amount: -1 })]),
      budgets([budget({ budget_amount: "5" })]),
      budgets([budget({ prevent_further_usage: "yes" })]),
      budgets([budget({ budget_scope: undefined })]),
      budgets(["x"]),
    ];
    for (const one of cases) expect(extractOrganizationBudgets(one)).toBeUndefined();
  });

  it("sends the request and reads the answer", async () => {
    const { client, requests } = fake([budgets([budget()])]);
    expect(await readOrganizationBudgets(client, "lab", signal)).toEqual([{ scope: "organization", entity: "lab", product: "actions", amount: 0, stops: true }]);
    expect(requests.map((one) => one.path)).toEqual(["/organizations/lab/settings/billing/budgets"]);
  });
});

describe("BILLING_PERMISSIONS", () => {
  it("names the path of the request of each endpoint", () => {
    const paths: Record<BillingEndpoint, string> = {
      userUsage: billingUsageRequest({ kind: "user", login: "octo" }, { year: 2026 }).path,
      organizationUsage: billingUsageRequest({ kind: "organization", login: "lab" }, { year: 2026 }).path,
      organizationBudgets: organizationBudgetsRequest("lab").path,
    };
    for (const [endpoint, path] of Object.entries(paths) as [BillingEndpoint, string][]) {
      const permission = BILLING_PERMISSIONS[endpoint];
      const template = permission.endpoint.replace(/^GET /, "").replace("{username}", "octo").replace("{org}", "lab");
      expect(template).toBe(path);
      expect(permission.access).toBe("read");
      expect(permission.owner).toBe(endpoint === "userUsage" ? "user" : "organization");
    }
    expect(Object.keys(BILLING_PERMISSIONS).sort()).toEqual(Object.keys(paths).sort());
  });
});
