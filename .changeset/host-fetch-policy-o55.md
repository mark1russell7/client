---
"@procedures/http": minor
"@procedures/weather": minor
"@procedures/bundle-assistant": minor
---

The default modules refuse a loopback, private or link-local host through the host policy (audit pass 2, roadmap O55, findings 12 and 32, decision D35).

MINOR: a break. Before, `weather.forecast` and the `mcpHostModules` of `geo` and `ics` sent a request to such a host with the global `fetch`. Version 0.28 gave a `DeprecationWarning` for it. Now the request gets `FORBIDDEN` with the reason `host-not-allowed`, and the host gets no request.

- `weather.forecast` of the default `weatherModule` refuses a `baseUrl` on a loopback, private or link-local address. The warning `PROCEDURES_WEATHER_PRIVATE_HOST` goes away.
- The `mcpHostModules` of `@procedures/bundle-assistant` refuse such a `baseUrl` of `geo.geocode` and `geo.route`, and such a feed of `ics.fetch`. The warnings `PROCEDURES_GEO_PRIVATE_HOST` and `PROCEDURES_ICS_PRIVATE_HOST` go away. The dev-tools server uses these modules.
- `createHostFetch()` of `@procedures/http` loses the deprecated option `warnOnRefusal`. A refused host always throws.
- The default modules of `geo` and `ics` do not change. They keep the global `fetch`, because their roots run in a browser.

Migration:

- A host that sends `weather.forecast` to its own Open-Meteo server on such an address gives a `fetch` that allows it: `createRegistry(createWeatherModule({ fetch: createHostFetch({ allow: ["10.0.0.5:8080"] }) }))`.
- A host with a private Nominatim, OSRM or calendar server gives `createGeoModule({ fetch: createHostFetch({ allow: [...] }) })` or `createIcsModule({ fetch: createHostFetch({ allow: [...] }) })` to `createRegistry()` before the bundle.
- A host that gave `warnOnRefusal` to `createHostFetch()` removes it, and puts the host in `allow`.
- The site: no change. It does not call `weather.forecast`, `geo.*` or `ics.fetch` through a registry of Node.
- MiniMongo and Graph: no change. They do not use these procedures.
- jarvis: no change. `packages/pipeline` calls the function `geocode()` of `@procedures/geo`, not the procedure, so the host policy does not apply.
