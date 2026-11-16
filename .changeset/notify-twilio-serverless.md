---
"@procedures/notify": patch
---

The new entry `@procedures/notify/twilio-serverless` has pure functions for the Twilio Serverless API. A browser can also use them.

- The request builders make a service, a function, an asset and their versions. They also start a build, and make an environment, a variable and a deployment.
- An upload of a version has a multipart body. Its boundary is pure, so the same input gives the same body.
- `twilioServerlessBuildStep` gives the next step of the poll of a build. It has no timer.
- The extractors read each response into a typed result or a `TwilioFailure`. They do not throw.
- A builder throws an error when the input breaks a rule of the API.

The shared types of `./twilio` moved to an internal module that the two entries import. The API of `./twilio` does not change.

PATCH: a new entry and new exports, before 1.0.0.
