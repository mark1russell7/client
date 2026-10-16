---
"@procedures/client": minor
---

`client.unique` compares the items by value: two equal JSON values are duplicates. An array compares by its items in order, and a plain object by its fields in any order. With `key`, the values of the field compare by value too. The result keeps the first item of each value, in the order of the input. Before, objects and arrays compared by reference, so two equal objects both stayed.
