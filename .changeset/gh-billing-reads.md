---
"@procedures/gh": patch
---

The root of `@procedures/gh` has the billing reads of GitHub: the usage report of an account and the budgets of an organization.

- `billingUsageRequest` gives the request of the usage report of a user or of an organization, for a year, a month or a day.
- `extractBillingUsage` reads the answer into items with the product, the SKU, the date, the quantity and the amounts in USD.
- `netAmountByProduct` adds the net amounts of each product.
- `organizationBudgetsRequest` and `extractOrganizationBudgets` read the budgets of an organization: the scope, the entity, the product, the amount and `stops`.
- `readBillingUsage` and `readOrganizationBudgets` send the request with a `RestClient` and read the answer.
- An extractor gives `undefined` for an answer that it cannot read. It does not give a part of a list.
- `BILLING_PERMISSIONS` gives the permission of a fine-grained token for each endpoint: "Plan" (read) of the user, and "Administration" (read) of the organization.
