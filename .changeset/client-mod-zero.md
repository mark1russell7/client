---
"@procedures/client": minor
---

`client.mod` refuses `b = 0` with the error `Division by zero`, as `client.divide` does. Before, it gave `NaN`.
