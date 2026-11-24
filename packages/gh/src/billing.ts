/**
 * The billing reads of GitHub: the usage report of an account and the budgets of an organization.
 *
 * - Each read has a request builder and an extractor. A caller can send the request with its own client.
 * - `readBillingUsage` and `readOrganizationBudgets` send the request with a `RestClient`.
 * - An extractor gives `undefined` for an answer that it cannot read. It does not give a part of a list.
 * - `usageAmounts` and `usageAmountsBy` add the amounts of the items of a report, for all items or for each group.
 * - `BILLING_PERMISSIONS` gives the permission of a fine-grained token for each endpoint.
 */

import type { RestAnswer, RestClient, RestRequest } from "./rest.js";

/** The account of a billing read: the personal account of a user, or an organization. */
export interface BillingAccount {
  /** This field is the kind of the account. */
  readonly kind: "user" | "organization";
  /** This field is the login of the user or of the organization. */
  readonly login: string;
}

/** The period of a usage report. A month needs a year, and a day needs a month. */
export interface BillingUsagePeriod {
  /** This field is the year, for example `2026`. */
  readonly year: number;
  /** This field is the month, from 1 to 12. Without it, the report has the whole year. */
  readonly month?: number | undefined;
  /** This field is the day of the month, from 1 to 31. Without it, the report has the whole month. */
  readonly day?: number | undefined;
}

/** One item of a usage report. The amounts are in USD. */
export interface BillingUsageItem {
  /** This field is the product, as GitHub gives it, for example `actions`. */
  readonly product: string;
  /** This field is the SKU of the item, or `undefined` when the item has none. */
  readonly sku: string | undefined;
  /** This field is the date of the item, or `undefined` when the item has none. */
  readonly date: string | undefined;
  /** This field is the quantity, in the unit of the SKU, or `undefined` when the item has none. */
  readonly quantity: number | undefined;
  /** This field is the cost before the discounts, or `undefined` when the item has none. */
  readonly grossAmount: number | undefined;
  /** This field is the discount, for example the minutes of the plan, or `undefined` when the item has none. */
  readonly discountAmount: number | undefined;
  /** This field is the cost after the discounts. */
  readonly netAmount: number;
  /** This field is the full name of the repository of the item, for example `lab/site`. An item with no repository does not have it. */
  readonly repository?: string | undefined;
  /** This field is the login of the organization of the item. An item with no organization does not have it. */
  readonly organization?: string | undefined;
}

/** The sums of the amounts of some items of a usage report, in USD. */
export interface BillingAmounts {
  /** This field is the count of the items. */
  readonly items: number;
  /** This field is the sum of the costs before the discounts. It is `undefined` when an item has no such cost. */
  readonly gross: number | undefined;
  /** This field is the sum of the discounts. It is `undefined` when an item has no discount. */
  readonly discount: number | undefined;
  /** This field is the sum of the costs after the discounts. */
  readonly net: number;
}

/** One budget of an organization. */
export interface BillingBudget {
  /** This field is the scope of the budget, for example `organization` or `repository`. */
  readonly scope: string;
  /** This field is the name of the thing of the scope, for example the login of the organization. */
  readonly entity: string;
  /** This field is the product or the SKU of the budget, for example `actions`. */
  readonly product: string;
  /** This field is the limit of the budget for one month, in USD. */
  readonly amount: number;
  /** This field is `true` when GitHub stops the paid use at the limit. Otherwise the budget only sends an alert. */
  readonly stops: boolean;
}

/** The billing endpoints of this module. */
export type BillingEndpoint = "userUsage" | "organizationUsage" | "organizationBudgets";

/** The permission of a fine-grained token for one endpoint. */
export interface BillingPermission {
  /** This field is the method and the path of the endpoint, as the GitHub REST docs give them. */
  readonly endpoint: string;
  /** This field tells if the permission is of the user or of the organization. */
  readonly owner: "user" | "organization";
  /** This field is the name of the permission in the settings of a fine-grained token. */
  readonly permission: string;
  /** This field is the access that the endpoint needs. */
  readonly access: "read" | "write";
}

/**
 * The permission of a fine-grained token for each endpoint, from the GitHub REST docs of 2026-11-21.
 * The page "Permissions required for fine-grained personal access tokens" gives them.
 * GitHub gives the usage report only to an account on the enhanced billing platform.
 */
export const BILLING_PERMISSIONS: Readonly<Record<BillingEndpoint, BillingPermission>> = {
  userUsage: { endpoint: "GET /users/{username}/settings/billing/usage", owner: "user", permission: "Plan", access: "read" },
  organizationUsage: { endpoint: "GET /organizations/{org}/settings/billing/usage", owner: "organization", permission: "Administration", access: "read" },
  organizationBudgets: { endpoint: "GET /organizations/{org}/settings/billing/budgets", owner: "organization", permission: "Administration", access: "read" },
};

/** A login of GitHub: 1 to 39 letters, digits and single hyphens. A hyphen is not first or last. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

// This check moves to the entry `/read` of `@mark1russell7/optional` when that entry is on npm.
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkLogin(login: string): string {
  if (!LOGIN.test(login)) throw new RangeError(`"${login}" is not a login of GitHub.`);
  return login;
}

function checkWhole(name: string, value: number, low: number, high: number): string {
  if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(`The ${name} ${String(value)} is not a whole number from ${String(low)} to ${String(high)}.`);
  return String(value);
}

/**
 * This function gives the request of the usage report of an account for a period.
 *
 * @param account - The user or the organization
 * @param period - The year, and the month and the day if necessary
 * @throws RangeError when the login is not a login of GitHub, or when the period is not a valid period
 */
export function billingUsageRequest(account: BillingAccount, period: BillingUsagePeriod): RestRequest {
  const login = checkLogin(account.login);
  const query: Record<string, string> = { year: checkWhole("year", period.year, 2000, 9999) };
  if (period.month !== undefined) query["month"] = checkWhole("month", period.month, 1, 12);
  if (period.day !== undefined) {
    if (period.month === undefined) throw new RangeError("A day of a usage report needs a month.");
    query["day"] = checkWhole("day", period.day, 1, 31);
  }
  const path = account.kind === "user" ? `/users/${login}/settings/billing/usage` : `/organizations/${login}/settings/billing/usage`;
  return { method: "GET", path, query };
}

function isText(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isAmount(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
}

function usageItem(value: unknown): BillingUsageItem | undefined {
  if (!isRecord(value)) return undefined;
  const { product, sku, date, quantity, grossAmount, discountAmount, netAmount, repositoryName, organizationName } = value;
  if (typeof product !== "string" || product === "" || typeof netAmount !== "number" || !Number.isFinite(netAmount)) return undefined;
  if (!isText(sku) || !isText(date) || !isAmount(quantity) || !isAmount(grossAmount) || !isAmount(discountAmount)) return undefined;
  if (!isText(repositoryName) || !isText(organizationName)) return undefined;
  return {
    product,
    sku: typeof sku === "string" ? sku : undefined,
    date: typeof date === "string" ? date : undefined,
    quantity: typeof quantity === "number" ? quantity : undefined,
    grossAmount: typeof grossAmount === "number" ? grossAmount : undefined,
    discountAmount: typeof discountAmount === "number" ? discountAmount : undefined,
    netAmount,
    ...(typeof repositoryName === "string" && repositoryName !== "" ? { repository: repositoryName } : {}),
    ...(typeof organizationName === "string" && organizationName !== "" ? { organization: organizationName } : {}),
  };
}

/**
 * This function gives the items of a usage report, or `undefined` when it cannot read the answer.
 * An answer that is not 200, a body with no list `usageItems`, and an item with no product or no net amount cannot be read.
 * A field of an item that has a different type also cannot be read. A `null` field is absent.
 * An empty name of a repository or of an organization is also absent.
 *
 * @param answer - The answer to `billingUsageRequest`
 */
export function extractBillingUsage(answer: RestAnswer): readonly BillingUsageItem[] | undefined {
  if (answer.status !== 200 || !isRecord(answer.body)) return undefined;
  const list = answer.body["usageItems"];
  if (!Array.isArray(list)) return undefined;
  const items: BillingUsageItem[] = [];
  for (const value of list as unknown[]) {
    const item = usageItem(value);
    if (item === undefined) return undefined;
    items.push(item);
  }
  return items;
}

/**
 * This function gives the sum of the net amounts of each product, with the name of the product in lower case.
 * It does not round the sums.
 *
 * @param items - The items of a usage report
 */
export function netAmountByProduct(items: readonly BillingUsageItem[]): ReadonlyMap<string, number> {
  return new Map([...usageAmountsBy(items, (item) => item.product.toLowerCase())].map(([product, amounts]) => [product, amounts.net]));
}

/**
 * This function gives the sums of the amounts of some items. It does not round the sums.
 * The sum of the costs before the discounts is `undefined` when an item has no such cost. A sum of a part of the items is not a result.
 * The same rule applies to the sum of the discounts.
 *
 * @param items - The items of a usage report, or a part of them
 */
export function usageAmounts(items: readonly BillingUsageItem[]): BillingAmounts {
  let gross: number | undefined = 0;
  let discount: number | undefined = 0;
  let net = 0;
  for (const item of items) {
    gross = gross === undefined || item.grossAmount === undefined ? undefined : gross + item.grossAmount;
    discount = discount === undefined || item.discountAmount === undefined ? undefined : discount + item.discountAmount;
    net += item.netAmount;
  }
  return { items: items.length, gross, discount, net };
}

/**
 * This function gives the sums of the amounts of each group of items, in the order of the first item of each group.
 * The key of an item names its group, for example its repository, its product or its day. An item with the key `undefined` is in no group.
 *
 * @param items - The items of a usage report
 * @param key - The function that gives the key of an item
 */
export function usageAmountsBy(items: readonly BillingUsageItem[], key: (item: BillingUsageItem) => string | undefined): ReadonlyMap<string, BillingAmounts> {
  const groups = new Map<string, BillingUsageItem[]>();
  for (const item of items) {
    const name = key(item);
    if (name === undefined) continue;
    const group = groups.get(name);
    if (group === undefined) groups.set(name, [item]);
    else group.push(item);
  }
  return new Map([...groups].map(([name, group]) => [name, usageAmounts(group)]));
}

/**
 * This function gives the day of an item as `YYYY-MM-DD`, from the start of its date. It gives `undefined` for an item with no date of that form.
 *
 * @param item - The item of a usage report
 */
export function usageDay(item: Pick<BillingUsageItem, "date">): string | undefined {
  const day = item.date?.slice(0, 10);
  return day !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

/**
 * This function reads the usage report of an account for a period. It gives `undefined` when it cannot read the answer.
 *
 * @param client - The REST client, with a token that has the permission of `BILLING_PERMISSIONS`
 * @param account - The user or the organization
 * @param period - The year, and the month and the day if necessary
 * @param signal - The signal that stops the read
 */
export async function readBillingUsage(client: RestClient, account: BillingAccount, period: BillingUsagePeriod, signal: AbortSignal): Promise<readonly BillingUsageItem[] | undefined> {
  return extractBillingUsage(await client.request(billingUsageRequest(account, period), signal));
}

/**
 * This function gives the request of the budgets of an organization.
 *
 * @param organization - The login of the organization
 * @throws RangeError when the login is not a login of GitHub
 */
export function organizationBudgetsRequest(organization: string): RestRequest {
  return { method: "GET", path: `/organizations/${checkLogin(organization)}/settings/billing/budgets` };
}

/**
 * This function gives the budgets of an organization, or `undefined` when it cannot read the answer.
 * An answer that is not 200 or that has a next page cannot be read. A budget with a field that is absent or of a
 * different type also cannot be read.
 *
 * @param answer - The answer to `organizationBudgetsRequest`
 */
export function extractOrganizationBudgets(answer: RestAnswer): readonly BillingBudget[] | undefined {
  if (answer.status !== 200 || !isRecord(answer.body)) return undefined;
  const list = answer.body["budgets"];
  if (!Array.isArray(list) || answer.body["has_next_page"] !== false || answer.body["total_count"] !== list.length) return undefined;
  const budgets: BillingBudget[] = [];
  for (const item of list as unknown[]) {
    if (!isRecord(item)) return undefined;
    const { budget_scope: scope, budget_entity_name: entity, budget_product_sku: product, budget_amount: amount, prevent_further_usage: stops } = item;
    if (typeof scope !== "string" || typeof entity !== "string" || typeof product !== "string" || product === "") return undefined;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || typeof stops !== "boolean") return undefined;
    budgets.push({ scope, entity, product, amount, stops });
  }
  return budgets;
}

/**
 * This function reads the budgets of an organization. It gives `undefined` when it cannot read the answer.
 *
 * @param client - The REST client, with a token that has the permission of `BILLING_PERMISSIONS`
 * @param organization - The login of the organization
 * @param signal - The signal that stops the read
 */
export async function readOrganizationBudgets(client: RestClient, organization: string, signal: AbortSignal): Promise<readonly BillingBudget[] | undefined> {
  return extractOrganizationBudgets(await client.request(organizationBudgetsRequest(organization), signal));
}
