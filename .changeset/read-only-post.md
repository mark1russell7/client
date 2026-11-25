---
"@procedures/http": patch
"@procedures/geo": patch
"@procedures/bundle-assistant": patch
---

A POST that only reads, for a service that takes its query only in the body of a POST.

- `createHostFetch()` of `@procedures/http` takes the new option `readOnlyPost`: the hosts that take a POST with a body. The default is no host, so the default fetch sends no POST. An entry is one host name or IP address, with a port or without one. It has no wildcard and no range. A POST follows no redirect.
- The new procedure `geo.soilAtPoint` of `@procedures/geo` gives the soil at a point, from USDA Soil Data Access (SSURGO). Its POST goes only to the endpoint of that service. The transport of `@procedures/geo` sends a POST only for a request that tells that it only reads.
- `geo.soilAtPoint` is a tool of `@procedures/bundle-assistant`. The `fetch` of `geo` in `mcpHostModules` takes a POST only for the host `sdmdataaccess.sc.egov.usda.gov`.
