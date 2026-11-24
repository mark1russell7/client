---
"@procedures/gh": patch
---

The billing reads give the cost of each group of usage items. An item of a usage report has two new optional fields, `repository` and `organization`, when GitHub names them. `usageAmounts` adds the cost before the discounts, the discounts and the cost after them. `usageAmountsBy(items, key)` gives these sums for each key, for example each repository or each day, and `usageDay` gives the day of an item. `netAmountByProduct` gives the same sums as before.
