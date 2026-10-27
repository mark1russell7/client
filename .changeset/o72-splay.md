---
"@procedures/splay": patch
---

The components of `@procedures/splay` have a form that registers nothing (the deferred findings of the invariants audit of O70).

- The new export `componentModule(name, components)` gives the procedures of a bundle or of a list of definitions as a module. Give the module to `createRegistry()` or `registerModules()`.
- The registration of `defineComponent()`, `simpleComponent()`, `namespacedComponent()` and `streamingComponent()` in the global registry is deprecated. The next MINOR removes that registration. These functions then only give the definition.
- `registerBundle()` is deprecated. The next MINOR removes it. Use `componentModule()` with `createRegistry()` or `registerModules()`.
