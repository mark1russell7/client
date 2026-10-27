---
"@procedures/splay": minor
---

The component helpers of `@procedures/splay` register nothing in the global registry (O75, rule I2). This change breaks the API.

- `defineComponent()`, `simpleComponent()`, `namespacedComponent()` and `streamingComponent()` only give the definition. They do not register a procedure in `PROCEDURE_REGISTRY`.
- `registerBundle()` and its export are removed.
- `componentModule(name, components)` replaces the two. It gives the procedures of a bundle or of a list of definitions as a module. Give the module to `createRegistry()` or `registerModules()`.
- `./register` of `@procedures/splay` does not change. It registers the bridge procedures `splay.bridge.info` and `splay.bridge.health`.

Migration:

- An app that calls `defineComponent()` and then starts the procedure of a component by its path gives the definitions to `componentModule()`. Then it registers the module.
  - For a registry of the app: `createRegistry(componentModule("my-app/ui", [userCard, badge]))`.
  - For the global registry: `registerModules(PROCEDURE_REGISTRY, [componentModule("my-app/ui", [userCard, badge])])`. Put this call in the `src/register.ts` of the app.
- An app that uses `registerBundle(bundle)` uses `registerModules(PROCEDURE_REGISTRY, [componentModule("my-app/ui", bundle)])`. The components of the bundle keep their paths.
- The site: the site does not use these functions. No step is necessary.
- MiniMongo, Graph and jarvis: find each call of `defineComponent`, `simpleComponent`, `namespacedComponent`, `streamingComponent` and `registerBundle`. Do the steps above for each one. An app without these calls has no step.
- `componentModule()` takes definitions with the data type `unknown`. A definition with a typed `input` schema uses `defineComponent<unknown>({ ... })` in the list.
