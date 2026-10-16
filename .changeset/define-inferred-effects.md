---
"@procedures/client": minor
"@procedures/compiler": minor
---

`procedure.define` keeps the effects of its body (roadmap R22). `programCheckInterceptor()` checks the body of each definition, refuses a body with an error, and gives its effects to `procedure.define` in the internal metadata key `__inferredEffects`. Each transport removes `__` keys from a request, so a remote caller cannot claim effects. The defined procedure keeps them as `metadata.inferredEffects`, and `toolHints()` uses them: before, a defined procedure had no hints. The admission still examines each nested call. New exports: `INFERRED_EFFECTS_METADATA_KEY`, `inferredEffectsOf()`, `effectsValue()`.
