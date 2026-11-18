---
"@procedures/compiler": patch
"@procedures/client": patch
---

`@procedures/compiler` has the new entry `./api`: the format `api-operation/1`. One document gives one operation of an HTTP API as data, and each value is a term of the formula kit of `@mark1russell7/coeval`.

- `buildApiRequest(operation, input, credentials)` gives the URL, the method, the headers and the body of one call. It checks the input and the credential against their JSON Schemas, and it does not send the request.
- `extractApiResponse(operation, response)` reads the status, the headers and the body text of the answer into a success or a failure. It does not throw.
- `apiOperationIssues(operation)` gives the problems of the structure of a document.
- The validator of `@cfworker/json-schema` (MIT, no dependencies) checks each schema. The `$schema` of a schema sets its draft. It is a new dependency of `@procedures/compiler`.
- The entry imports no Node built-in, so a browser can use it.
- The range of `@mark1russell7/coeval` goes from `^0.34.0` to `^0.38.1` in both packages, for the standard operations `STD_OPS`. The breaking steps 0.35.0 to 0.38.0 change no import of these packages.
