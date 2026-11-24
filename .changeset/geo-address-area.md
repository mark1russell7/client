---
"@procedures/geo": patch
---

`locateAddress` takes an optional `area`: the town and the postal code of the address. Two towns in one search box can have the same street and number. The function then keeps the elements whose `addr:postcode` or `addr:city` agree with the area. With no area, the result does not change.
